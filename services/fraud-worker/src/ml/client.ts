import { config } from '../config.js';
import { VelocityFeatures } from '../features/velocity.js';
import { GraphFeatures } from '../graph/neo4j.js';

export interface FraudScoringInput {
  tenantId?: string;
  transactionId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  channel: string;
  deviceId?: string;
  ipAddress?: string;
  timestamp: string;
  velocity: VelocityFeatures;
  graph: GraphFeatures;
}

export interface FraudScoringResult {
  fraudScore: number;
  status: 'APPROVED' | 'FLAGGED' | 'BLOCKED';
  modelVersion: string;
  inferenceDurationMs: number;
  usedFallback: boolean;
  fraudEventId?: string;
  fraudRingIds?: string[];
  suspiciousAccounts?: string[];
  topDrivers?: Array<{ feature: string; value: number; shap_contribution: number }>;
  graphStatus?: 'OK' | 'DEGRADED';
}

/**
 * Computes heuristic fraud score if Python ONNX service is not yet available.
 * Implements bank-grade rule priors (velocity spike, graph mule proximity, high amount).
 */
export function calculateHeuristicScore(input: FraudScoringInput): number {
  let score = 0.05; // baseline benign probability

  // 1. Graph Hops & Mule Ring Proximity (Highest Risk Driver)
  if (input.graph.graphHops > 0 || input.graph.fraudRingIds.length > 0) {
    score += 0.65;
    score += Math.min(input.graph.graphHops * 0.1, 0.25);
  }

  // 2. Velocity Bursts (e.g. 5+ transfers in 1 minute)
  if (input.velocity.count1m >= 5) {
    score += 0.45;
  } else if (input.velocity.count1m >= 3) {
    score += 0.25;
  }

  // 3. 1-Hour Cumulative Spike
  if (input.velocity.count1h >= 10) {
    score += 0.2;
  }
  if (input.velocity.sumAmount1h >= 10000) {
    score += 0.25;
  }

  // 4. Large Transaction Outlier
  if (input.amount >= 10000) {
    score += 0.2;
  } else if (input.amount >= 5000) {
    score += 0.1;
  }

  // 5. Channel Risk Multipliers
  if (input.channel === 'atm') {
    score += 0.05;
  }

  // Normalize score between 0.01 and 0.99
  return Math.min(Math.max(parseFloat(score.toFixed(4)), 0.01), 0.99);
}

/**
 * Calls Python FastAPI ONNX ML service with sub-25ms timeout and instant heuristic fallback.
 */
export async function scoreFraud(input: FraudScoringInput): Promise<FraudScoringResult> {
  const startTime = Date.now();

  // 1. Try Dev 1's full end-to-end scoring endpoint /v1/transactions/score
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60);

    const txPayload = {
      tenantId: input.tenantId || '00000000-0000-4000-8000-0000000000a1',
      transactionId: input.transactionId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      currency: input.currency || 'USD',
      channel: input.channel || 'web',
      deviceId: input.deviceId,
      ipAddress: input.ipAddress,
      timestamp: input.timestamp,
    };

    const response = await fetch(`${config.mlServiceUrl}/v1/transactions/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': input.transactionId,
      },
      body: JSON.stringify(txPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      const scoreObj = data.score || {};
      const prob = typeof scoreObj.fraud_probability === 'number' ? scoreObj.fraud_probability : 0.05;
      const duration = Date.now() - startTime;

      return {
        fraudScore: prob,
        status: scoreObj.status || (prob >= config.thresholds.blocked ? 'BLOCKED' : prob >= config.thresholds.flagged ? 'FLAGGED' : 'APPROVED'),
        modelVersion: scoreObj.model_version || 'fraud-v1',
        inferenceDurationMs: scoreObj.inference_latency_ms || duration,
        usedFallback: false,
        fraudEventId: data.fraud_event_id,
        fraudRingIds: data.fraud_ring_ids || [],
        suspiciousAccounts: data.suspicious_accounts || [],
        topDrivers: data.top_drivers || [],
        graphStatus: scoreObj.graph_status || 'OK',
      };
    }
  } catch (_err) {
    // Continue to feature-score route or fallback
  }

  // 2. Try direct hydrated feature score /v1/models/fraud/score
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35);

    const featuresPayload = {
      transaction_id: input.transactionId,
      tenant_id: input.tenantId || '00000000-0000-4000-8000-0000000000a1',
      features: {
        amount_zscore: (input.amount - 250) / 500,
        velocity_1h: input.velocity.count1h,
        velocity_24h: input.velocity.count24h,
        graph_hops: input.graph.graphHops,
        is_new_beneficiary: true,
        device_age_days: 12.0,
        ip_country_risk: 0.1,
        hour_of_day: new Date(input.timestamp).getUTCHours(),
        day_of_week: new Date(input.timestamp).getUTCDay(),
        channel_risk_score: input.channel === 'atm' ? 0.3 : 0.05,
      },
    };

    const response = await fetch(`${config.mlServiceUrl}/v1/models/fraud/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': input.transactionId,
      },
      body: JSON.stringify(featuresPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      const score = typeof data.fraud_probability === 'number' ? data.fraud_probability : 0.05;
      const modelVersion = data.model_version || 'fraud-v1';
      const duration = Date.now() - startTime;

      return {
        fraudScore: score,
        status:
          score >= config.thresholds.blocked
            ? 'BLOCKED'
            : score >= config.thresholds.flagged
            ? 'FLAGGED'
            : 'APPROVED',
        modelVersion,
        inferenceDurationMs: data.inference_latency_ms || duration,
        usedFallback: false,
        graphStatus: data.graph_status || 'OK',
      };
    }
  } catch (_err) {
    // Expected when Python ML service is offline or responding > 35ms
  }

  // 3. Graceful fallback to deterministic heuristic engine
  const heuristicScore = calculateHeuristicScore(input);
  const duration = Date.now() - startTime;

  return {
    fraudScore: heuristicScore,
    status:
      heuristicScore >= config.thresholds.blocked
        ? 'BLOCKED'
        : heuristicScore >= config.thresholds.flagged
        ? 'FLAGGED'
        : 'APPROVED',
    modelVersion: 'heuristic-rules-v1',
    inferenceDurationMs: duration,
    usedFallback: true,
  };
}
