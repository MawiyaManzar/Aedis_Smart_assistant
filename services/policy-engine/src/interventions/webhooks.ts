import crypto from 'crypto';
import { AlertInputEvent, PolicyAction, WebhookDispatchResult } from '../types.js';

/**
 * Dispatches simulated SMS / WhatsApp Step-Up OTP gateway.
 * (In production, connects to Twilio / Sinch / Infobip)
 */
export async function dispatchSmsOtp(
  alert: AlertInputEvent,
  action: 'sms_otp' | 'whatsapp_otp'
): Promise<WebhookDispatchResult> {
  const startTime = Date.now();
  const refId = `otp_${action}_${crypto.randomBytes(4).toString('hex')}`;
  const mockCode = Math.floor(100000 + Math.random() * 900000).toString();

  // Simulate network roundtrip (2-5ms)
  await new Promise((r) => setTimeout(r, 4));

  return {
    action,
    target: alert.payload?.fromAccountId || 'account_unknown',
    status: 'SUCCESS',
    referenceId: refId,
    durationMs: Date.now() - startTime,
    metadata: {
      channel: action,
      maskedPhone: '+1 (555) ***-8921',
      ttlSeconds: 120,
      challengeCodeHash: crypto.createHash('sha256').update(mockCode).digest('hex').slice(0, 16),
      reason: `Flagged transfer of $${alert.payload?.amount} requiring step-up authentication`,
    },
  };
}

/**
 * Dispatches simulated Payment Escrow Freeze.
 * (In production, connects to Core Banking Ledger / Stripe / Adyen soft-hold API)
 */
export async function dispatchFreezeEscrow(
  alert: AlertInputEvent
): Promise<WebhookDispatchResult> {
  const startTime = Date.now();
  const refId = `escrow_freeze_${crypto.randomBytes(4).toString('hex')}`;

  // Simulate banking core roundtrip (5-8ms)
  await new Promise((r) => setTimeout(r, 6));

  return {
    action: 'freeze_escrow',
    target: `tx_escrow_${alert.transactionId}`,
    status: 'SUCCESS',
    referenceId: refId,
    durationMs: Date.now() - startTime,
    metadata: {
      amount: alert.payload?.amount,
      currency: alert.payload?.currency || 'USD',
      holdType: 'HARD_ESCROW_LOCK',
      fraudScore: alert.fraudScore,
      graphHops: alert.graphHops,
      muleRingsIdentified: alert.fraudRingIds,
    },
  };
}

/**
 * Dispatches simulated Loan CRM Task.
 */
export async function dispatchCrmTask(
  alert: AlertInputEvent,
  action: 'crm_task' | 'crm_call' | 'soft_hold' | 'in_app_nudge'
): Promise<WebhookDispatchResult> {
  const startTime = Date.now();
  const refId = `crm_${action}_${crypto.randomBytes(4).toString('hex')}`;

  await new Promise((r) => setTimeout(r, 3));

  return {
    action,
    target: alert.payload?.fromAccountId || 'account_unknown',
    status: 'SUCCESS',
    referenceId: refId,
    durationMs: Date.now() - startTime,
    metadata: {
      priority: 'HIGH',
      assignedQueue: 'FINANCIAL_DISTRESS_REST_TEAM',
    },
  };
}

/**
 * Dispatches all configured graduated webhooks in parallel.
 */
export async function dispatchInterventions(
  alert: AlertInputEvent,
  actions: PolicyAction[]
): Promise<WebhookDispatchResult[]> {
  const dispatchPromises = actions.map(async (action): Promise<WebhookDispatchResult> => {
    try {
      switch (action) {
        case 'sms_otp':
        case 'whatsapp_otp':
          return await dispatchSmsOtp(alert, action);
        case 'freeze_escrow':
          return await dispatchFreezeEscrow(alert);
        case 'crm_task':
        case 'crm_call':
        case 'soft_hold':
        case 'in_app_nudge':
          return await dispatchCrmTask(alert, action);
        case 'analyst_dashboard':
        default:
          return {
            action,
            target: 'analyst_feed',
            status: 'SUCCESS',
            referenceId: `dash_${Date.now()}`,
            durationMs: 1,
            metadata: { notified: true },
          };
      }
    } catch (err: any) {
      return {
        action,
        target: 'gateway',
        status: 'FAILED',
        referenceId: `err_${Date.now()}`,
        durationMs: 0,
        metadata: { error: err.message },
      };
    }
  });

  return Promise.all(dispatchPromises);
}
