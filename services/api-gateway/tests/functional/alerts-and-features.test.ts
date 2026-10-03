import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { getTestApp, teardownTestApp } from '../helpers/test-app.js';
import { redis } from '../../src/redis.js';
import { config } from '../../src/config.js';

describe('Functional: Alerts, Features & Telemetry Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('GET /v1/telemetry returns Redis stream telemetry and SLO specifications', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/telemetry',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.service).toBe('api-gateway');
    expect(body.status).toBe('UP');
    expect(body.slo.targetLatencyMs).toBe(50);
    expect(body.streams).toBeDefined();
    expect(body.streams.rawStream).toBe(config.streamName);
  });

  it('GET /v1/features/velocity/:accountId returns hydrated atomic velocities', async () => {
    const accountId = `ACC-TEST-${Date.now()}`;
    // Simulate velocity increment from worker
    await redis.incr(`feat:velocity:1m:${accountId}`);
    await redis.incrbyfloat(`feat:amount_sum:1h:${accountId}`, 4500.5);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/features/velocity/${accountId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.velocity.accountId).toBe(accountId);
    expect(body.velocity.count1m).toBeGreaterThanOrEqual(1);
    expect(body.velocity.sumAmount1h).toBeCloseTo(4500.5);
  });

  it('GET /v1/alerts returns alerts and POST /v1/alerts/:id/resolve resolves an alert', async () => {
    const alertId = `alt_${Date.now()}`;
    // Seed an alert into alertStream
    await redis.xadd(
      config.alertStream,
      '*',
      'alertId', alertId,
      'transactionId', 'tx-test-123',
      'tenantId', 'tenant_bank_alpha',
      'status', 'BLOCKED',
      'fraudScore', '0.92',
      'graphHops', '2',
      'fraudRingIds', JSON.stringify(['ring_alpha_1']),
      'velocity', JSON.stringify({ count1m: 4, count1h: 9, sumAmount1h: 12000 }),
      'timestamp', new Date().toISOString()
    );

    const getRes = await app.inject({
      method: 'GET',
      url: '/v1/alerts?count=5',
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.alerts.length).toBeGreaterThanOrEqual(1);

    // Resolve the alert
    const resolveRes = await app.inject({
      method: 'POST',
      url: `/v1/alerts/${alertId}/resolve`,
      payload: {
        resolution: 'CONFIRM_BLOCK',
        analystNote: 'Confirmed mule ring linkage across 2 hops',
      },
    });

    expect(resolveRes.statusCode).toBe(200);
    const resolveBody = JSON.parse(resolveRes.body);
    expect(resolveBody.message).toBe('Alert resolved successfully');
    expect(resolveBody.result.alertId).toBe(alertId);
    expect(resolveBody.result.resolution).toBe('CONFIRM_BLOCK');
  });
});
