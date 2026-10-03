import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getStreamTelemetry } from '../redis.js';

export const telemetryRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/', async (_request, reply) => {
    const streamTelemetry = await getStreamTelemetry();

    return reply.status(200).send({
      service: 'api-gateway',
      status: 'UP',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      streams: streamTelemetry,
      slo: {
        targetLatencyMs: 50,
        expectedOutcomeMs: 50,
        graphHopTimeoutMs: 15,
        mlInferenceTimeoutMs: 25,
      },
      timestamp: new Date().toISOString(),
    });
  });
};
