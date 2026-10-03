import { config } from '../config.js';
import { VelocityFeatures } from '../features/velocity.js';
import { GraphFeatures } from '../graph/neo4j.js';

export interface FraudScoringInput {
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25); // 25ms timeout

    const featuresPayload = {
      transaction_id: input.transactionId,
      amount: input.amount,
      amount_zscore: (input.amount - 250) / 500,
      velocity_1m: input.velocity.count1m,
      velocity_1h: input.velocity.count1h,
      velocity_24h: input.velocity.count24h,
      sum_amount_1h: input.velocity.sumAmount1h,
      graph_hops: input.graph.graphHops,
      fraud_ring_count: input.graph.fraudRingIds.length,
      channel: input.channel,
      hour_of_day: new Date(input.timestamp).getUTCHours(),
      day_of_week: new Date(input.timestamp).getUTCDay(),
    };

    const response = await fetch(`${config.mlServiceUrl}/v1/models/fraud/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(featuresPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      const score = typeof data.fraudScore === 'number' ? data.fraudScore : data.fraud_probability ?? 0.05;
      const modelVersion = data.modelVersion || data.model_version || 'xgboost-onnx-v1';
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
        inferenceDurationMs: duration,
        usedFallback: false,
      };
    }
  } catch (_err) {
    // Expected when Python ML service is offline or responding > 25ms
  }

  // Graceful fallback to deterministic heuristic engine
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
