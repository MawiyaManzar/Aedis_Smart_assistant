export type PolicyAction =
  | 'sms_otp'
  | 'whatsapp_otp'
  | 'freeze_escrow'
  | 'in_app_nudge'
  | 'crm_task'
  | 'crm_call'
  | 'soft_hold'
  | 'analyst_dashboard';

export interface PolicyRule {
  actions: PolicyAction[];
  ttl_seconds?: number;
  on_failure?: string;
  notify?: string[];
}

export interface PolicyMatrix {
  version: string;
  updatedAt: string;
  fraud: {
    FLAGGED: PolicyRule;
    BLOCKED: PolicyRule;
  };
  distress?: {
    MEDIUM?: PolicyRule;
    HIGH?: PolicyRule;
    CRITICAL?: PolicyRule;
  };
}

export interface WebhookDispatchResult {
  action: PolicyAction;
  target: string;
  status: 'SUCCESS' | 'FAILED';
  referenceId: string;
  durationMs: number;
  metadata: Record<string, any>;
}

export interface AlertInputEvent {
  alertId: string;
  transactionId: string;
  tenantId: string;
  status: 'FLAGGED' | 'BLOCKED';
  fraudScore: number;
  graphHops: number;
  fraudRingIds: string[];
  velocity: {
    count1m: number;
    count1h: number;
    count24h: number;
    sumAmount1h: number;
  };
  payload: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    currency: string;
    channel: string;
  };
  timestamp: string;
}

export interface InterventionEvent {
  interventionId: string;
  alertId: string;
  transactionId: string;
  tenantId: string;
  status: 'FLAGGED' | 'BLOCKED';
  fraudScore: number;
  actionsDispatched: PolicyAction[];
  results: WebhookDispatchResult[];
  stateTransition: 'STEP_UP_SENT' | 'BLOCKED_HELD';
  timestamp: string;
}
