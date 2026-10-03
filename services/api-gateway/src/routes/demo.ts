import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { redis } from '../redis.js';
import { config } from '../config.js';

export const demoRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * POST /v1/demo/scam-ring
   * Executes the exact multi-phase synthetic attack from scripts/demo-scam-ring.ts
   */
  fastify.post('/scam-ring', async (_request, reply) => {
    const victimAccount = 'acc_victim_david_882';
    const muleAccount = 'acc_mule_ring_delta';
    const sharedDeviceId = 'DEV-ROOTED-89X';
    const generatedEvents: string[] = [];

    // Phase 1: Micro-probes (3 rapid events to push sliding-window velocity)
    for (let i = 1; i <= 3; i++) {
      const txId = crypto.randomUUID();
      const amount = 25 * i;
      const payload = {
        transactionId: txId,
        fromAccountId: victimAccount,
        toAccountId: `acc_test_receiver_${i}`,
        amount,
        currency: 'USD',
        channel: 'mobile',
        deviceId: sharedDeviceId,
        timestamp: new Date().toISOString(),
      };

      const entryId = await redis.xadd(
        config.streamName,
        '*',
        'tenantId', 'tenant_bank_alpha',
        'transactionId', txId,
        'payload', JSON.stringify(payload),
        'receivedAt', Date.now().toString()
      );
      generatedEvents.push(entryId);
    }

    // Phase 2: Critical Exfiltration Wipeout
    const bigTxId = crypto.randomUUID();
    const bigAmount = 48500;
    const bigPayload = {
      transactionId: bigTxId,
      fromAccountId: victimAccount,
      toAccountId: muleAccount,
      amount: bigAmount,
      currency: 'USD',
      channel: 'mobile',
      deviceId: sharedDeviceId,
      ipAddress: '197.45.10.88',
      timestamp: new Date().toISOString(),
    };

    const bigEntryId = await redis.xadd(
      config.streamName,
      '*',
      'tenantId', 'tenant_bank_alpha',
      'transactionId', bigTxId,
      'payload', JSON.stringify(bigPayload),
      'receivedAt', Date.now().toString()
    );
    generatedEvents.push(bigEntryId);

    return reply.status(200).send({
      success: true,
      message: 'Synthetic mule ring attack successfully injected into stream:transaction:raw',
      victimAccount,
      muleAccount,
      wipeoutAmount: bigAmount,
      eventIds: generatedEvents,
      primaryTxId: bigTxId,
    });
  });

  /**
   * POST /v1/demo/loan-distress
   * Emits synthetic early distress and SHAP explanation from scripts/demo-loan-distress.ts
   */
  fastify.post('/loan-distress', async (_request, reply) => {
    const borrowerId = 'BORROWER-SME-0418';
    const distressScore = 78;
    const auditId = `audit_distress_${crypto.randomBytes(4).toString('hex')}`;

    const shapDrivers = [
      { feature: 'cash_reserves_drop', label: 'Cash reserves dropped 82% over 14 days', impact: 44 },
      { feature: 'atm_spikes', label: 'ATM cash-out withdrawals spiked 4x above baseline', impact: 28 },
      { feature: 'revenue_stagnation', label: 'Merchant receivables down 35% MoM', impact: 18 },
    ];

    const regulatorSummary =
      'Default risk 78%: Cash reserves dropped 82% over 14 days and ATM withdrawals spiked 4x.';

    const entryId = await redis.xadd(
      config.auditStream,
      '*',
      'alertId', auditId,
      'transactionId', borrowerId,
      'tenantId', 'tenant_bank_alpha',
      'status', 'FLAGGED',
      'fraudScore', (distressScore / 100).toFixed(2),
      'auditSummary', regulatorSummary,
      'shapDrivers', JSON.stringify(shapDrivers),
      'llmModel', 'google/gemini-2.0-flash-001',
      'timestamp', new Date().toISOString()
    );

    return reply.status(200).send({
      success: true,
      message: 'Loan distress evaluation and SHAP drivers emitted to stream:audit:logged',
      borrowerId,
      distressScore,
      auditId,
      streamEntryId: entryId,
      regulatorSummary,
    });
  });
};
