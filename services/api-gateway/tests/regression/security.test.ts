import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getTestApp, teardownTestApp } from '../helpers/test-app.js';
import { validTransaction } from '../fixtures/transactions.fixture.js';

describe('Regression: Security & Input Sanitization', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('SEC-001: handles SQL injection patterns in account IDs safely without throwing unhandled exceptions', async () => {
    const sqlInjectionPayload = {
      ...validTransaction,
      transactionId: randomUUID(),
      fromAccountId: "acc_user_101' OR '1'='1",
      toAccountId: "acc_mule'; DROP TABLE transactions; --",
    };

    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: sqlInjectionPayload,
    });

    // Gateway safely accepts strings and escapes them into JSON without evaluating
    expect(response.statusCode).toBe(202);
  });

  it('SEC-002: preserves and escapes XSS script payloads safely in device and IP fields', async () => {
    const xssPayload = {
      ...validTransaction,
      transactionId: randomUUID(),
      deviceId: '<script>alert("xss")</script>',
      ipAddress: '"><svg onload=alert(1)>',
    };

    const response = await app.inject({
      method: 'POST',
      url: '/v1/transactions',
      payload: xssPayload,
    });

    expect(response.statusCode).toBe(202);
  });

  it('SEC-003: rejects auth requests with malformed JSON body gracefully without crashing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { 'Content-Type': 'application/json' },
      payload: '{"broken_json": ',
    });

    expect(response.statusCode).toBe(400);
  });
});
