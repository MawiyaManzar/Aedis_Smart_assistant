import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getTestApp, teardownTestApp } from '../helpers/test-app.js';
import { redis } from '../../src/redis.js';
import { config } from '../../src/config.js';
import { validTransaction } from '../fixtures/transactions.fixture.js';

describe('Regression: Downstream Worker Contract Integrity', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('CTR-001: guarantees Redis Stream payload contains all fields required by Fraud Scoring & Graph Sync workers', async () => {
    const testTx = {
      ...validTransaction,
      transactionId: randomUUID(),
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: testTx,
    });

    expect(res.statusCode).toBe(202);
    const resBody = JSON.parse(res.body);

    // Fetch from Redis
    const entries = await redis.xrange(config.streamName, resBody.eventId, resBody.eventId);
    expect(entries.length).toBe(1);
    const [, fields] = entries[0];

    const streamMap: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      streamMap[fields[i]] = fields[i + 1];
    }

    // Top-level stream envelope contract
    expect(streamMap).toHaveProperty('tenantId');
    expect(streamMap).toHaveProperty('transactionId');
    expect(streamMap).toHaveProperty('payload');
    expect(streamMap).toHaveProperty('receivedAt');

    // Inner transaction payload contract
    const parsed = JSON.parse(streamMap.payload);
    expect(parsed).toHaveProperty('transactionId');
    expect(parsed).toHaveProperty('fromAccountId');
    expect(parsed).toHaveProperty('toAccountId');
    expect(parsed).toHaveProperty('amount');
    expect(parsed).toHaveProperty('currency');
    expect(parsed).toHaveProperty('channel');
    expect(parsed).toHaveProperty('deviceId');
    expect(parsed).toHaveProperty('ipAddress');
    expect(parsed).toHaveProperty('timestamp');
  });
});
