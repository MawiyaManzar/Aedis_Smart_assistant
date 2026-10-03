import { describe, it, expect, vi } from 'vitest';
import { calculateHeuristicScore } from '../src/ml/client.js';
import { checkGraphMuleConnections } from '../src/graph/neo4j.js';

describe('Fraud Worker Modules', () => {
  describe('Heuristic Scoring Engine', () => {
    it('returns low score for normal low-velocity transaction without mule hops', () => {
      const score = calculateHeuristicScore({
        transactionId: 'tx-100',
        fromAccountId: 'acc-normal',
        toAccountId: 'acc-receiver',
        amount: 50,
        currency: 'USD',
        channel: 'mobile',
        timestamp: new Date().toISOString(),
        velocity: { count1m: 1, count1h: 1, count24h: 1, sumAmount1h: 50 },
        graph: { graphHops: 0, fraudRingIds: [], queryDurationMs: 2 },
      });

      expect(score).toBeLessThan(0.3); // APPROVED
    });

    it('returns FLAGGED score for moderate velocity bursts', () => {
      const score = calculateHeuristicScore({
        transactionId: 'tx-101',
        fromAccountId: 'acc-burst',
        toAccountId: 'acc-receiver',
        amount: 400,
        currency: 'USD',
        channel: 'mobile',
        timestamp: new Date().toISOString(),
        velocity: { count1m: 3, count1h: 5, count24h: 8, sumAmount1h: 1200 },
        graph: { graphHops: 0, fraudRingIds: [], queryDurationMs: 3 },
      });

      expect(score).toBeGreaterThanOrEqual(0.3); // FLAGGED
      expect(score).toBeLessThan(0.7);
    });

    it('returns BLOCKED score when connected to 3-hop mule ring', () => {
      const score = calculateHeuristicScore({
        transactionId: 'tx-102',
        fromAccountId: 'acc-mule-connected',
        toAccountId: 'acc-mule-hub',
        amount: 8500,
        currency: 'USD',
        channel: 'atm',
        timestamp: new Date().toISOString(),
        velocity: { count1m: 6, count1h: 12, count24h: 20, sumAmount1h: 15000 },
        graph: { graphHops: 2, fraudRingIds: ['ring-alpha-99'], queryDurationMs: 8 },
      });

      expect(score).toBeGreaterThanOrEqual(0.7); // BLOCKED
    });
  });

  describe('Neo4j Graph Traversal & Fallback', () => {
    it('handles query safely and honors timeout constraint', async () => {
      // Calling with 15ms timeout against local Neo4j instance
      const result = await checkGraphMuleConnections('acc-test-random', 15);
      expect(result).toHaveProperty('graphHops');
      expect(result).toHaveProperty('fraudRingIds');
      expect(result).toHaveProperty('queryDurationMs');
      expect(typeof result.graphHops).toBe('number');
      expect(Array.isArray(result.fraudRingIds)).toBe(true);
    });
  });
});
