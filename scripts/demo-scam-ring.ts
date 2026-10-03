import { Redis } from 'ioredis';
import crypto from 'crypto';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const RAW_STREAM = process.env.RAW_STREAM || 'stream:transaction:raw';

const redis = new Redis(REDIS_URL);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScamRingDemo() {
  console.log('\n=============================================================');
  console.log('  🚨 AEDIS LIVE DEMO: REAL-TIME MULE RING & SCAM ATTACK 🚨');
  console.log('=============================================================\n');

  const victimAccount = 'acc_victim_david_882';
  const muleAccount = 'acc_mule_ring_delta';
  const sharedDeviceId = 'DEV-ROOTED-89X';

  console.log('📍 Phase 1: Attacker tests account authorization with rapid micro-probes...');
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
      RAW_STREAM,
      '*',
      'tenantId', 'tenant_bank_alpha',
      'transactionId', txId,
      'payload', JSON.stringify(payload),
      'receivedAt', Date.now().toString()
    );

    console.log(`   ⚡ [Micro-Probe ${i}/3] Ingested $${amount} (ID: ${entryId})`);
    await sleep(200);
  }

  console.log('\n📍 Phase 2: Attacker initiates full account wipeout to mule cluster...');
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

  const startTime = Date.now();
  const bigEntryId = await redis.xadd(
    RAW_STREAM,
    '*',
    'tenantId', 'tenant_bank_alpha',
    'transactionId', bigTxId,
    'payload', JSON.stringify(bigPayload),
    'receivedAt', Date.now().toString()
  );
  const elapsed = Date.now() - startTime;

  console.log(`   🛑 [CRITICAL EXFILTRATION] Ingested $${bigAmount.toLocaleString()} to ${muleAccount}`);
  console.log(`   ⏱️ Redis Stream Ingestion Latency: ${elapsed}ms (< 3ms SLO Target)`);
  console.log(`   📦 Event ID: ${bigEntryId}`);

  console.log('\n=============================================================');
  console.log('  🎯 CHECK THE FRONTEND DASHBOARD (http://localhost:3002):');
  console.log('   1. Critical card appears in RED: "BLOCKED (Score: 0.94)"');
  console.log('   2. Neo4j Cytoscape Graph highlights 3-hop mule ring linkages');
  console.log('   3. Graduated Action: Escrow frozen automatically');
  console.log('   4. OpenRouter Explainability: 1-sentence regulator summary');
  console.log('=============================================================\n');

  await redis.quit();
  process.exit(0);
}

runScamRingDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
