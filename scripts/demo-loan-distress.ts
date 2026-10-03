import { Redis } from 'ioredis';
import crypto from 'crypto';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const AUDIT_STREAM = process.env.AUDIT_STREAM || 'stream:audit:logged';

const redis = new Redis(REDIS_URL);

async function runLoanDistressDemo() {
  console.log('\n=============================================================');
  console.log('  📊 AEDIS LIVE DEMO: EARLY LOAN DISTRESS & COMPLIANCE SHAP 📊');
  console.log('=============================================================\n');

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

  console.log(`📍 Analyzing Borrower: ${borrowerId} (Commercial Term Facility)`);
  console.log(`   📈 LightGBM Distress Score: ${distressScore}/100 [HIGH DISTRESS]`);
  console.log(`   ⚖️ OpenRouter Regulatory Summary: "${regulatorSummary}"`);
  console.log('   📊 Top SHAP Contributors:');
  shapDrivers.forEach((d) => console.log(`      • ${d.label} (${d.impact}%)`));

  // Push to audit stream
  await redis.xadd(
    AUDIT_STREAM,
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

  console.log('\n=============================================================');
  console.log('  🎯 CHECK THE FRONTEND DASHBOARD (http://localhost:3002):');
  console.log('   1. Switch to "CREDIT ANALYST" role in sidebar');
  console.log('   2. Select borrower BORROWER-SME-0418 (Score: 78)');
  console.log('   3. Open Explainability Drawer: view SHAP bar chart & summary');
  console.log('   4. Click "DISPATCH RESTRUCTURING PLAYBOOK" to record audit trail');
  console.log('=============================================================\n');

  await redis.quit();
  process.exit(0);
}

runLoanDistressDemo().catch((err) => {
  console.error('Distress demo error:', err);
  process.exit(1);
});
