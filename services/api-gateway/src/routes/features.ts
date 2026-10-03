import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getAccountVelocity } from '../redis.js';

export const featureRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Query atomic Redis feature store velocity metrics
  fastify.get('/velocity/:accountId', async (request, reply) => {
    const { accountId } = request.params as { accountId: string };

    if (!accountId) {
      return reply.status(400).send({ error: 'accountId parameter is required' });
    }

    const velocity = await getAccountVelocity(accountId);
    return reply.status(200).send({
      success: true,
      velocity,
      timestamp: new Date().toISOString(),
    });
  });
};
