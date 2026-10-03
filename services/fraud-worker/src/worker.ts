import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from './config.js';
import { trackAndHydrateVelocity } from './features/velocity.js';
import { checkGraphMuleConnections, closeNeo4jDriver } from './graph/neo4j.js';
import { scoreFraud } from './ml/client.js';
import { initPostgres, saveFraudEvent, closePostgres } from './db/postgres.js';

let isRunning = true;

// Redis reader client for blocking XREADGROUP
const redisReader = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Redis writer client for pipelined feature stores, alerts, and XACK
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

/**
 * Initializes Redis Consumer Group with at-least-once delivery guarantees.
 */
async function setupConsumerGroup(): Promise<void> {
  try {
    await redisWriter.xgroup(
      'CREATE',
      config.rawStream,
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

/**
 * High-speed sub-50ms fraud scoring loop.
 */
async function startWorkerLoop(): Promise<void> {
  console.log(`\n🚀 Aedis Fraud Scoring Worker started [${config.consumerName}]`);
  console.log(`📡 Listening on stream: "${config.rawStream}"`);
  console.log(`🎯 Publishing alerts to: "${config.alertStream}"`);
  console.log(`⚡ SLO Target: < 50ms end-to-end\n`);

  while (isRunning) {
    try {
      // 1. Read up to 10 unread messages (BLOCK for 2 seconds)
      const streamResults = (await (redisReader as any).xreadgroup(
        'GROUP',
        config.consumerGroup,
        config.consumerName,
        'BLOCK',
        2000,
        'COUNT',
        10,
        'STREAMS',
        config.rawStream,
        '>'
      )) as [string, [string, string[]][]][] | null;

      if (!streamResults || streamResults.length === 0) {
        continue;
      }

      for (const [_stream, messages] of streamResults) {
        for (const [messageId, rawFields] of messages) {
          const startTime = Date.now();
          const parsedFields = parseStreamFields(rawFields);
          const tenantId = parsedFields.tenantId || 'tenant_bank_alpha';

          let txPayload: any;
          try {
            txPayload = JSON.parse(parsedFields.payload);
          } catch (_parseErr) {
            console.error(`❌ Bad JSON payload in message ${messageId}`);
            await redisWriter.xack(config.rawStream, config.consumerGroup, messageId);
            continue;
          }

          const {
            transactionId,
            fromAccountId,
            toAccountId,
            amount,
            currency = 'USD',
            channel = 'mobile',
            deviceId,
            ipAddress,
            timestamp = new Date().toISOString(),
          } = txPayload;

          // 2. Parallel Feature Hydration (Redis Feature Store + Neo4j 3-hop query)
          // Executed simultaneously via Promise.all to achieve < 20ms combined duration
          const [velocity, graph] = await Promise.all([
            trackAndHydrateVelocity(redisWriter, fromAccountId, amount),
            checkGraphMuleConnections(fromAccountId, 15),
          ]);

          // 3. Score Fraud with Python ONNX ML service or instant heuristic fallback
          const scoringResult = await scoreFraud({
            transactionId,
            fromAccountId,
            toAccountId,
            amount,
            currency,
            channel,
            deviceId,
            ipAddress,
            timestamp,
            velocity,
            graph,
          });

          const totalLatencyMs = Date.now() - startTime;

          // 4. Asynchronously persist score to PostgreSQL
          saveFraudEvent({
            transactionId,
            fraudScore: scoringResult.fraudScore,
            status: scoringResult.status,
            graphHops: graph.graphHops,
            fraudRingIds: graph.fraudRingIds,
            modelVersion: scoringResult.modelVersion,
          }).catch(() => {});

          // 5. Emit alert if transaction is FLAGGED or BLOCKED
          if (scoringResult.status !== 'APPROVED') {
            const alertId = crypto.randomUUID();
            await redisWriter.xadd(
              config.alertStream,
              '*',
              'alertId', alertId,
              'transactionId', transactionId,
              'tenantId', tenantId,
              'status', scoringResult.status,
              'fraudScore', scoringResult.fraudScore.toString(),
              'graphHops', graph.graphHops.toString(),
              'fraudRingIds', JSON.stringify(graph.fraudRingIds),
              'velocity', JSON.stringify(velocity),
              'modelVersion', scoringResult.modelVersion,
              'payload', JSON.stringify(txPayload),
              'timestamp', new Date().toISOString()
            );
          }

          // 6. Acknowledge message in Redis stream
          await redisWriter.xack(config.rawStream, config.consumerGroup, messageId);

          const statusEmoji =
            scoringResult.status === 'BLOCKED'
              ? '🛑 BLOCKED'
              : scoringResult.status === 'FLAGGED'
              ? '⚠️ FLAGGED'
              : '✅ APPROVED';

          console.log(
            `[TX ${transactionId.slice(0, 8)}] ${statusEmoji} | Score: ${scoringResult.fraudScore.toFixed(
              4
            )} | Hops: ${graph.graphHops} | Vel1m: ${velocity.count1m} | Latency: ${totalLatencyMs}ms ${
              totalLatencyMs < 50 ? '⚡ (Under SLO)' : ''
            }`
          );
        }
      }
    } catch (loopErr: any) {
      if (isRunning) {
        console.error('❌ Worker loop error:', loopErr.message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

async function shutdown(): Promise<void> {
  console.log('\n🛑 Gracefully shutting down fraud-worker...');
  isRunning = false;

  await Promise.allSettled([
    redisReader.quit(),
    redisWriter.quit(),
    closeNeo4jDriver(),
    closePostgres(),
  ]);

  console.log('👋 Worker stopped cleanly');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main(): Promise<void> {
  await initPostgres();
  await setupConsumerGroup();
  await startWorkerLoop();
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
