import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { calculateAnalyticalShap } from '../src/shap/client.js';
import { buildDeterministicSummary, generateRegulatorSummary } from '../src/llm/openrouter.js';
import { AlertEvent } from '../src/types.js';

describe('Explainability Worker Core Engine', () => {
  const baseAlert: AlertEvent = {
    alertId: crypto.randomUUID(),
    transactionId: crypto.randomUUID(),
    tenantId: 'tenant_bank_alpha',
    status: 'BLOCKED',
    fraudScore: 0.92,
    graphHops: 3,
    fraudRingIds: ['ring_alpha_99'],
    velocity: { count1m: 6, count1h: 12, count24h: 18, sumAmount1h: 15000 },
    payload: {
      transactionId: crypto.randomUUID(),
      fromAccountId: 'acc_victim_1',
      toAccountId: 'acc_mule_3',
      amount: 4500,
      currency: 'USD',
      channel: 'atm',
    },
    modelVersion: 'xgboost-onnx-v1',
    timestamp: new Date().toISOString(),
  };

  describe('SHAP Feature Attribution (Analytical Fallback)', () => {
    it('ranks graph mule proximity as primary driver when hops > 0', () => {
      const drivers = calculateAnalyticalShap(baseAlert);

      expect(drivers.length).toBeLessThanOrEqual(3);
      expect(drivers.length).toBeGreaterThan(0);

      // Top driver should be graph mule connection
      const topDriver = drivers[0];
      expect(topDriver.feature).toBe('graph_mule_hops');
      expect(topDriver.direction).toBe('INCREASED_RISK');
      expect(topDriver.impactPercent).toBeGreaterThanOrEqual(40);
    });

    it('ranks velocity burst as primary driver when velocity is abnormal without graph hops', () => {
      const velocityAlert: AlertEvent = {
        ...baseAlert,
        graphHops: 0,
        fraudRingIds: [],
        velocity: { count1m: 8, count1h: 10, count24h: 12, sumAmount1h: 800 },
        payload: { ...baseAlert.payload, amount: 100 },
      };

      const drivers = calculateAnalyticalShap(velocityAlert);
      expect(drivers[0].feature).toBe('velocity_burst_1m');
      expect(drivers[0].label).toContain('8 transactions within 60 seconds');
    });
  });

  describe('Regulatory Compliance Summary (ADR-004)', () => {
    it('produces exactly one sentence under 200 characters without markdown', () => {
      const drivers = calculateAnalyticalShap(baseAlert);
      const summary = buildDeterministicSummary(baseAlert.fraudScore, drivers, baseAlert.status);

      expect(summary.length).toBeLessThanOrEqual(200);
      expect(summary.endsWith('.')).toBe(true);
      // No markdown headers, bolding, or lists
      expect(summary).not.toContain('**');
      expect(summary).not.toContain('#');
      expect(summary).not.toContain('\n');
      expect(summary).toContain('Risk 92/100');
    });

    it('generateRegulatorSummary gracefully returns valid explanation structure', async () => {
      const drivers = calculateAnalyticalShap(baseAlert);
      const result = await generateRegulatorSummary(baseAlert.fraudScore, baseAlert.status, drivers);

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('model');
      expect(result.summary.length).toBeGreaterThan(10);
      expect(result.summary.length).toBeLessThanOrEqual(200);
    });
  });
});
