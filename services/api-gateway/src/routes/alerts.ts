import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getRecentAlerts, resolveAlertEvent } from '../redis.js';

const ResolveAlertSchema = z.object({
  resolution: z.enum(['OVERRIDE_APPROVE', 'CONFIRM_BLOCK', 'ESCALATE', 'STEP_UP_PASSED', 'STEP_UP_FAILED']),
  analystNote: z.string().optional().default(''),
});

export const alertRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Get recent alerts from Redis stream
  fastify.get('/', async (request, reply) => {
    const query = request.query as { count?: string };
    const count = query.count ? parseInt(query.count, 10) : 20;

    const alerts = await getRecentAlerts(count);
    return reply.status(200).send({
      alerts,
      count: alerts.length,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Resolve alert (ADR-006 & Section 7.3 Analyst Action API)
  fastify.post('/:id/resolve', async (request, reply) => {
    const { id } = request.params as { id: string };

    const parseResult = ResolveAlertSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid resolution payload',
        details: parseResult.error.format(),
      });
    }

    const { resolution, analystNote } = parseResult.data;
    // Extract authenticated user if available
    const analystId = (request.headers['x-analyst-id'] as string) || 'user_analyst_01';
    const tenantId = (request.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-0000000000a1';
    const requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();

    // 1. Attempt to forward to ML Service for DB persistence and state-machine integrity
    let upstreamResult: any = null;
    try {
      const resp = await fetch(`${config.mlServiceUrl}/v1/alerts/${encodeURIComponent(id)}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          resolution,
          resolved_by: analystId,
          note: analystNote || undefined,
        }),
      });

      if (resp.ok) {
        upstreamResult = await resp.json();
      } else if (resp.status === 409) {
        const conflictErr = await resp.json();
        return reply.status(409).send(conflictErr);
      }
    } catch (_err) {
      // Graceful fallback if ML service is unreachable
    }

    // 2. Persist in Redis and emit audit event
    const result = await resolveAlertEvent(id, resolution, analystNote, analystId);

    reply.header('x-request-id', requestId);
    return reply.status(200).send({
      message: 'Alert resolved successfully',
      result,
      upstream: upstreamResult,
    });
  });
};
