import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { getTestApp, teardownTestApp } from '../helpers/test-app.js';
import { invalidTransactions } from '../fixtures/transactions.fixture.js';

describe('Regression: Schema Boundary & Data Integrity', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('REG-001: rejects negative amounts to prevent balance corruption', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: invalidTransactions.negativeAmount,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid transaction schema');
    expect(response.body).toContain('Amount must be greater than 0');
  });

  it('REG-002: rejects zero amount transactions', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: invalidTransactions.zeroAmount,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('Amount must be greater than 0');
  });

  it('REG-003: rejects non-UUID transactionId to preserve global idempotency keys', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: invalidTransactions.invalidUuid,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid transaction schema');
  });

  it('REG-004: rejects transaction missing sender account ID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: invalidTransactions.missingSender,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('fromAccountId');
  });

  it('REG-005: rejects unsupported payment channel values', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: invalidTransactions.invalidChannel,
    });

    expect(response.statusCode).toBe(400);
  });

  it('REG-006: rejects completely empty body with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});
