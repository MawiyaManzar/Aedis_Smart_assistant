import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from './config.js';
import { AlertInputEvent, InterventionEvent } from './types.js';
import { initPolicyLoader, getPolicyRule, closePolicyLoader } from './matrix/loader.js';
import { dispatchInterventions } from './interventions/webhooks.js';
import { initPolicyDb, recordInterventionAudit, closePolicyDb } from './db/audit.js';

let isRunning = true;

const redisReader = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const redisWriter = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

function parseStreamFields(fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    result[fields[i]] = fields[i + 1];
  }
  return result;
}

async function setupConsumerGroup(): Promise<void> {
  try {
    await redisWriter.xgroup(
      'CREATE',
      config.alertStream,
      config.consumerGroup,
      '$',
      'MKSTREAM'
    );
    console.log(`✅ Consumer group created: ${config.consumerGroup}`);
  } catch (err: any) {
    if (err.message && err.message.includes('BUSYGROUP')) {
      console.log(`ℹ️ Consumer group ${config.consumerGroup} already active`);
    } else {
      console.warn(`⚠️ Warning setting up consumer group: ${err.message}`);
    }
  }
}

async function startWorkerLoop(): Promise<void> {
  console.log(`\n🛡️ Aedis Policy Engine & Graduated Interventions started [${config.consumerName}]`);
  console.log(`📡 Listening on stream: "${config.alertStream}"`);
  console.log(`⚡ Dispatching interventions to: "${config.interventionStream}"\n`);

  while (isRunning) {
    try {
      const streamResults = (await (redisReader as any).xreadgroup(
        'GROUP',
        config.consumerGroup,
        config.consumerName,
        'BLOCK',
        2000,
        'COUNT',
        10,
        'STREAMS',
        config.alertStream,
        '>'
      )) as [string, [string, string[]][]][] | null;

      if (!streamResults || streamResults.length === 0) {
        continue;
      }

      for (const [_stream, messages] of streamResults) {
        for (const [messageId, rawFields] of messages) {
          const startTime = Date.now();
          const parsed = parseStreamFields(rawFields);

          let parsedPayload: any = {};
          let parsedVelocity: any = { count1m: 0, count1h: 0, count24h: 0, sumAmount1h: 0 };
          let parsedRings: string[] = [];

          try {
            if (parsed.payload) parsedPayload = JSON.parse(parsed.payload);
            if (parsed.velocity) parsedVelocity = JSON.parse(parsed.velocity);
            if (parsed.fraudRingIds) parsedRings = JSON.parse(parsed.fraudRingIds);
          } catch (_err) {}

          const alertEvent: AlertInputEvent = {
            alertId: parsed.alertId || '',
            transactionId: parsed.transactionId || '',
            tenantId: parsed.tenantId || 'tenant_bank_alpha',
            status: (parsed.status as any) || 'FLAGGED',
            fraudScore: parseFloat(parsed.fraudScore || '0.5'),
            graphHops: parseInt(parsed.graphHops || '0', 10),
            fraudRingIds: parsedRings,
            velocity: parsedVelocity,
            payload: parsedPayload,
            timestamp: parsed.timestamp || new Date().toISOString(),
          };

          // 1. Evaluate Rule Tree from active Hot-Reloadable Policy Matrix
          const policyRule = getPolicyRule(alertEvent.status);
          const actionsToDispatch = policyRule.actions || [];

          // 2. Dispatch Graduated Webhooks in Parallel
          const dispatchResults = await dispatchInterventions(alertEvent, actionsToDispatch);

          const stateTransition =
            alertEvent.status === 'BLOCKED' ? 'BLOCKED_HELD' : 'STEP_UP_SENT';

          const interventionEvent: InterventionEvent = {
            interventionId: `intv_${crypto.randomBytes(4).toString('hex')}`,
            alertId: alertEvent.alertId,
            transactionId: alertEvent.transactionId,
            tenantId: alertEvent.tenantId,
            status: alertEvent.status,
            fraudScore: alertEvent.fraudScore,
            actionsDispatched: actionsToDispatch,
            results: dispatchResults,
            stateTransition,
            timestamp: new Date().toISOString(),
          };

          // 3. Persist Intervention Audit to Postgres
          recordInterventionAudit(interventionEvent).catch(() => {});

          // 4. Emit to stream:intervention:dispatched
          await redisWriter.xadd(
            config.interventionStream,
            '*',
            'interventionId', interventionEvent.interventionId,
            'alertId', alertEvent.alertId,
            'transactionId', alertEvent.transactionId,
            'tenantId', alertEvent.tenantId,
            'status', alertEvent.status,
            'stateTransition', stateTransition,
            'actionsDispatched', JSON.stringify(actionsToDispatch),
            'results', JSON.stringify(dispatchResults),
            'timestamp', interventionEvent.timestamp
          );

          // 5. Acknowledge message in alert stream
          await redisWriter.xack(config.alertStream, config.consumerGroup, messageId);

          const durationMs = Date.now() - startTime;
          const actionsSummary = actionsToDispatch.join(', ');

          console.log(
            `[INTERVENTION ${alertEvent.transactionId.slice(0, 8)}] 🎯 Action: [${actionsSummary}] ➔ State: ${stateTransition} in ${durationMs}ms`
          );
        }
      }
    } catch (loopErr: any) {
      if (isRunning) {
        console.error('❌ Policy engine worker error:', loopErr.message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

async function shutdown(): Promise<void> {
  console.log('\n🛑 Gracefully shutting down policy-engine...');
  isRunning = false;

  await Promise.allSettled([
    redisReader.quit(),
    redisWriter.quit(),
    closePolicyLoader(),
    closePolicyDb(),
  ]);

  console.log('👋 Policy-engine stopped cleanly');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main(): Promise<void> {
  await initPolicyDb();
  await initPolicyLoader();
  await setupConsumerGroup();
  await startWorkerLoop();
}

main().catch((err) => {
  console.error('Fatal initialization error in policy-engine:', err);
  process.exit(1);
});
