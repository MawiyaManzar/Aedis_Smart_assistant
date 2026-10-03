import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getRecentInterventions } from '../redis.js';

export const interventionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /v1/interventions?count=20
   * Returns recent graduated interventions dispatched by policy-engine
   */
  fastify.get('/', async (request, reply) => {
    const query = request.query as { count?: string };
    const count = Math.min(parseInt(query.count || '20', 10), 100);

    const interventions = await getRecentInterventions(count);

    return reply.status(200).send({
      success: true,
      interventions,
      count: interventions.length,
      timestamp: new Date().toISOString(),
    });
  });
};
