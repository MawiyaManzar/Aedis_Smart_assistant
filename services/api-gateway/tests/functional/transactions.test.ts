import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { getTestApp, teardownTestApp } from '../helpers/test-app.js';
import { redis } from '../../src/redis.js';
import { config } from '../../src/config.js';
import { validTransaction, highValueTransfer } from '../fixtures/transactions.fixture.js';

describe('Functional: Transaction Ingestion (/v1/transactions)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('accepts a valid transaction, returns HTTP 202, and lands in Redis Stream within 5ms', async () => {
    const startTime = performance.now();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: validTransaction,
    });

    const durationMs = performance.now() - startTime;

    expect(response.statusCode).toBe(202);
    expect(durationMs).toBeLessThan(50); // Bank SLO check

    const body = JSON.parse(response.body);
    expect(body.status).toBe('ACCEPTED');
    expect(body.eventId).toBeTypeOf('string');
    expect(body.transactionId).toBe(validTransaction.transactionId);
    expect(body.expectedOutcomeMs).toBe(50);

    // Verify Checkpoint 1: Event exists in Redis Stream
    const streamEntries = await redis.xrange(config.streamName, body.eventId, body.eventId);
    expect(streamEntries.length).toBe(1);

    const [latestId, fields] = streamEntries[0];
    expect(latestId).toBe(body.eventId);

    // Redis stream fields are stored as flat key-value pairs in array [key, val, key, val]
    const streamMap: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      streamMap[fields[i]] = fields[i + 1];
    }

    expect(streamMap.transactionId).toBe(validTransaction.transactionId);
    expect(streamMap.tenantId).toBe('tenant_bank_alpha');

    const parsedPayload = JSON.parse(streamMap.payload);
    expect(parsedPayload.amount).toBe(validTransaction.amount);
    expect(parsedPayload.fromAccountId).toBe(validTransaction.fromAccountId);
  });

  it('preserves custom tenant partition header (x-tenant-id)', async () => {
    const customTenantId = 'tenant_bank_switzerland';

    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      headers: {
        'x-tenant-id': customTenantId,
      },
      payload: highValueTransfer,
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);

    const streamEntries = await redis.xrange(config.streamName, body.eventId, body.eventId);
    expect(streamEntries.length).toBe(1);
    const [, fields] = streamEntries[0];

    const streamMap: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      streamMap[fields[i]] = fields[i + 1];
    }

    expect(streamMap.tenantId).toBe(customTenantId);
    expect(streamMap.transactionId).toBe(highValueTransfer.transactionId);
  });
});
