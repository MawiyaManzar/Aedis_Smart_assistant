import { Redis } from 'ioredis';
import { config } from './config.js';
import { AlertEvent } from './types.js';
import { getShapDrivers } from './shap/client.js';
import { generateRegulatorSummary } from './llm/openrouter.js';
import { initAuditDb, insertAuditLog, updateFraudEventExplanation, closeAuditDb } from './db/audit.js';

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
  console.log(`\n🧠 Aedis Explainability Worker started [${config.consumerName}]`);
  console.log(`📡 Listening on stream: "${config.alertStream}"`);
  console.log(`📜 Emitting audit summaries to: "${config.auditStream}"`);
  console.log(`🤖 LLM Engine: ${config.openrouterApiKey ? config.openrouterModel : 'Deterministic Compliance Template'}\n`);

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

          const alertEvent: AlertEvent = {
            alertId: parsed.alertId || '',
            transactionId: parsed.transactionId || '',
            tenantId: parsed.tenantId || 'tenant_bank_alpha',
            status: (parsed.status as any) || 'FLAGGED',
            fraudScore: parseFloat(parsed.fraudScore || '0.5'),
            graphHops: parseInt(parsed.graphHops || '0', 10),
            fraudRingIds: parsedRings,
            velocity: parsedVelocity,
            payload: parsedPayload,
            modelVersion: parsed.modelVersion || 'unknown',
            timestamp: parsed.timestamp || new Date().toISOString(),
          };

          // 1. Calculate SHAP feature drivers
          const shapDrivers = await getShapDrivers(alertEvent);

          // 2. Generate 1-sentence regulator explanation via OpenRouter / Deterministic Template
          const explanation = await generateRegulatorSummary(
            alertEvent.fraudScore,
            alertEvent.status,
            shapDrivers
          );

          // 3. Update PostgreSQL Source of Truth
          await Promise.allSettled([
            updateFraudEventExplanation(alertEvent.transactionId, shapDrivers, explanation.summary),
            insertAuditLog({
              entityType: 'FRAUD_EVENT',
              entityId: alertEvent.transactionId,
              eventType: 'EXPLAINED',
              actor: 'SYSTEM',
              payload: {
                alertId: alertEvent.alertId,
                status: alertEvent.status,
                fraudScore: alertEvent.fraudScore,
                shapDrivers,
                auditSummary: explanation.summary,
                llmModel: explanation.model,
                usedFallback: explanation.usedFallback,
              },
            }),
          ]);

          // 4. Emit to stream:audit:logged for dashboard streaming
          await redisWriter.xadd(
            config.auditStream,
            '*',
            'alertId', alertEvent.alertId,
            'transactionId', alertEvent.transactionId,
            'tenantId', alertEvent.tenantId,
            'status', alertEvent.status,
            'fraudScore', alertEvent.fraudScore.toString(),
            'auditSummary', explanation.summary,
            'shapDrivers', JSON.stringify(shapDrivers),
            'llmModel', explanation.model,
            'timestamp', new Date().toISOString()
          );

          // 5. Acknowledge message in alert stream
          await redisWriter.xack(config.alertStream, config.consumerGroup, messageId);

          const durationMs = Date.now() - startTime;
          console.log(`[EXPLAINED ${alertEvent.transactionId.slice(0, 8)}] in ${durationMs}ms`);
          console.log(`   ⚖️ Summary: "${explanation.summary}"`);
          console.log(
            `   📊 Top Driver: ${shapDrivers[0]?.label || 'None'} (${shapDrivers[0]?.impactPercent || 0}%)\n`
          );
        }
      }
    } catch (loopErr: any) {
      if (isRunning) {
        console.error('❌ Explainability worker loop error:', loopErr.message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

async function shutdown(): Promise<void> {
  console.log('\n🛑 Gracefully shutting down explain-worker...');
  isRunning = false;

  await Promise.allSettled([
    redisReader.quit(),
    redisWriter.quit(),
    closeAuditDb(),
  ]);

  console.log('👋 Explain-worker stopped cleanly');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main(): Promise<void> {
  await initAuditDb();
  await setupConsumerGroup();
  await startWorkerLoop();
}

main().catch((err) => {
  console.error('Fatal initialization error in explain-worker:', err);
  process.exit(1);
});
