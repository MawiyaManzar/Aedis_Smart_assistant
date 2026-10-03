import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { TransactionSchema } from '../schemas/transaction.js';
import { pushTransactionToStream } from '../redis.js';

export const transactionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/', async (request, reply) => {
    // 1. Validate payload against Zod schema
    const parseResult = TransactionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid transaction schema',
        details: parseResult.error.format(),
      });
    }

    const transaction = parseResult.data;

    // 2. Extract tenant context from headers or authenticated user
    const tenantId = (request.headers['x-tenant-id'] as string) || 'tenant_bank_alpha';

    // 3. Push to Redis Stream (takes ~1ms)
    try {
      const streamEntryId = await pushTransactionToStream({
        tenantId,
        transactionId: transaction.transactionId,
        payload: JSON.stringify(transaction),
      });

      // 4. Bank-Grade Pattern (ADR-001):
      // Return HTTP 202 Accepted immediately. We don't make the user wait for ML models!
      return reply.status(202).send({
        status: 'ACCEPTED',
        eventId: streamEntryId,
        transactionId: transaction.transactionId,
        expectedOutcomeMs: 50,
      });
    } catch (err: any) {
      fastify.log.error('Failed to publish transaction to stream:', err);
      return reply.status(500).send({ error: 'Ingestion pipeline error' });
    }
  });
};
