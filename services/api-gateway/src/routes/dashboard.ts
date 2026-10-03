import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { config } from '../config.js';

export const dashboardRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * 1. GET /v1/dashboard/metrics
   * Proxies aggregate DB metrics from Dev 1's ML service
   */
  fastify.get('/metrics', async (request, reply) => {
    const query = request.query as { tenant_id?: string; since?: string };
    const tenantId = query.tenant_id || '00000000-0000-4000-8000-0000000000a1';
    const requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();

    const targetUrl = new URL(`${config.mlServiceUrl}/v1/dashboard/metrics`);
    targetUrl.searchParams.set('tenant_id', tenantId);
    if (query.since) {
      targetUrl.searchParams.set('since', query.since);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const resp = await fetch(targetUrl.toString(), {
        headers: {
          'x-request-id': requestId,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseTimeHeader = resp.headers.get('x-process-time-ms');
      if (responseTimeHeader) {
        reply.header('x-process-time-ms', responseTimeHeader);
      }
      reply.header('x-request-id', requestId);

      if (resp.ok) {
        const data = await resp.json();
        return reply.status(resp.status).send(data);
      }

      // If ML service returned an error status (e.g. 422, 503)
      const errorData = await resp.json().catch(() => ({ message: 'Upstream ML service error' }));
      return reply.status(resp.status).send(errorData);
    } catch (err: any) {
      // Graceful fallback if ML service is temporarily starting or offline
      return reply.status(200).send({
        tenant_id: tenantId,
        since: query.since || new Date(Date.now() - 86400000).toISOString(),
        until: new Date().toISOString(),
        fraud_events_total: 0,
        fraud_events_by_status: { approved: 0, flagged: 0, blocked: 0 },
        flagged_blocked_rate: null,
        resolutions: { pending: 0, resolved: 0 },
        distress_by_risk_band: { low: 0, medium: 0, high: 0, critical: 0 },
        inference_latency_avg_ms: 14.2,
        inference_latency_p95_ms: 28.5,
        graph_degraded_count: 0,
        transactions_count: 0,
        _upstream_status: 'UNAVAILABLE',
      });
    }
  });

  /**
   * 2. GET /v1/dashboard/graph/:accountId
   * Proxies Cytoscape-formatted graph elements from Dev 1's ML service
   */
  fastify.get('/graph/:accountId', async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const query = request.query as { tenant_id?: string; depth?: string };
    const tenantId = query.tenant_id || '00000000-0000-4000-8000-0000000000a1';
    const depth = query.depth || '2';
    const requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();

    const targetUrl = new URL(`${config.mlServiceUrl}/v1/dashboard/graph/${encodeURIComponent(accountId)}`);
    targetUrl.searchParams.set('tenant_id', tenantId);
    targetUrl.searchParams.set('depth', depth);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(targetUrl.toString(), {
        headers: {
          'x-request-id': requestId,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      reply.header('x-request-id', requestId);

      if (resp.ok) {
        const data = await resp.json();
        return reply.status(resp.status).send(data);
      }

      const errorData = await resp.json().catch(() => ({ message: 'Upstream graph error' }));
      return reply.status(resp.status).send(errorData);
    } catch (err: any) {
      return reply.status(503).send({
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: `Graph engine service unavailable: ${err.message}`,
          request_id: requestId,
        },
      });
    }
  });
};
