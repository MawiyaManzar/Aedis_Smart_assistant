import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getRecentAuditLogs } from '../redis.js';

export const auditRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /v1/audit/logs?count=20
   * Returns recent immutable explainability audit records from stream:audit:logged
   */
  fastify.get('/logs', async (request, reply) => {
    const query = request.query as { count?: string };
    const count = Math.min(parseInt(query.count || '20', 10), 100);

    const logs = await getRecentAuditLogs(count);

    return reply.status(200).send({
      success: true,
      auditLogs: logs,
      count: logs.length,
      timestamp: new Date().toISOString(),
    });
  });
};
