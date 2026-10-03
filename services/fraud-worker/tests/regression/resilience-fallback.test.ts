import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { checkGraphMuleConnections } from '../../src/graph/neo4j.js';
import { scoreFraud } from '../../src/ml/client.js';
import { saveFraudEvent } from '../../src/db/postgres.js';

describe('Regression: Resilience & Fault-Tolerance', () => {
  it('REG-003: honors 15ms Neo4j timeout constraint and returns clean fallback even with invalid account ID', async () => {
    const startTime = Date.now();
    const result = await checkGraphMuleConnections('non-existent-account-xyz-999', 15);
    const elapsed = Date.now() - startTime;

    expect(result).toHaveProperty('graphHops');
    expect(result.graphHops).toBe(0);
    expect(result.fraudRingIds).toEqual([]);
    // Ensure timeout or query returned quickly
    expect(elapsed).toBeLessThan(100);
  });

  it('REG-004: fails gracefully to heuristic engine when ML service endpoint is unavailable', async () => {
    const result = await scoreFraud({
      transactionId: crypto.randomUUID(),
      fromAccountId: 'acc_ml_fallback',
      toAccountId: 'acc_receiver',
      amount: 12000, // High amount outlier
      currency: 'USD',
      channel: 'web',
      timestamp: new Date().toISOString(),
      velocity: { count1m: 4, count1h: 8, count24h: 15, sumAmount1h: 18000 },
      graph: { graphHops: 1, fraudRingIds: ['ring_123'], queryDurationMs: 5 },
    });

    expect(result.usedFallback).toBe(true);
    expect(result.modelVersion).toBe('heuristic-rules-v1');
    expect(result.status).toBe('BLOCKED');
    expect(result.fraudScore).toBeGreaterThanOrEqual(0.7);
  });

  it('REG-005: postgres saveFraudEvent never throws unhandled exception when DB is down', async () => {
    // Should not throw even if Postgres is not connected or credentials fail
    await expect(
      saveFraudEvent({
        transactionId: crypto.randomUUID(),
        fraudScore: 0.85,
        status: 'BLOCKED',
        graphHops: 2,
        fraudRingIds: ['ring_mock'],
        modelVersion: 'heuristic-rules-v1',
      })
    ).resolves.not.toThrow();
  });
});
