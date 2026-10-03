import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getActivePolicyMatrix, updateAndPublishPolicyMatrix } from '../redis.js';

export const policyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /v1/policy
   * Returns current active graduated intervention policy matrix
   */
  fastify.get('/', async (_request, reply) => {
    const matrix = await getActivePolicyMatrix();
    return reply.status(200).send({
      success: true,
      policy: matrix,
    });
  });

  /**
   * POST /v1/policy
   * Updates policy matrix, stores in Redis, and hot-reloads policy-engine via channel:policy:reload (ADR-005)
   */
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid policy payload' });
    }

    const updated = await updateAndPublishPolicyMatrix(body);

    return reply.status(200).send({
      success: true,
      message: 'Policy matrix updated and broadcasted to worker pool',
      policy: updated,
    });
  });
};
