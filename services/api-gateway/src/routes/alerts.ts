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

    const result = await resolveAlertEvent(id, resolution, analystNote, analystId);

    return reply.status(200).send({
      message: 'Alert resolved successfully',
      result,
    });
  });
};
