import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server.js';
import { redis } from '../../src/redis.js';

describe('Functional: Policy Matrix, Interventions & Audit Streams', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
  });

  it('GET /v1/policy returns active policy matrix', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/policy',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.policy).toBeDefined();
    expect(body.policy.fraud).toBeDefined();
    expect(body.policy.fraud.FLAGGED).toBeDefined();
  });

  it('POST /v1/policy updates policy matrix and broadcasts to Redis pub/sub', async () => {
    const updatedMatrix = {
      version: '3.0.0-test',
      thresholds: {
        lowThreshold: 25,
        stepUpThreshold: 60,
        freezeThreshold: 75,
      },
      fraud: {
        FLAGGED: { actions: ['sms_otp'] },
        BLOCKED: { actions: ['freeze_escrow'] },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/policy',
      payload: updatedMatrix,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.policy.version).toBe('3.0.0-test');

    // Verify GET retrieves updated policy
    const getRes = await app.inject({
      method: 'GET',
      url: '/v1/policy',
    });
    expect(getRes.json().policy.version).toBe('3.0.0-test');
  });

  it('GET /v1/interventions returns array of dispatched interventions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/interventions?count=5',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.interventions)).toBe(true);
  });

  it('GET /v1/audit/logs returns stream of explainability records', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/audit/logs?count=5',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.auditLogs)).toBe(true);
  });
});
