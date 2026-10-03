export interface VelocityData {
  count1m: number;
  count1h: number;
  count24h: number;
  sumAmount1h: number;
}

export interface TransactionPayload {
  transactionId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  channel: string;
  deviceId?: string;
  ipAddress?: string;
  timestamp?: string;
}

export interface AlertEvent {
  alertId: string;
  transactionId: string;
  tenantId: string;
  status: 'FLAGGED' | 'BLOCKED';
  fraudScore: number;
  graphHops: number;
  fraudRingIds: string[];
  velocity: VelocityData;
  payload: TransactionPayload;
  modelVersion: string;
  timestamp: string;
}

export interface ShapDriver {
  feature: string;
  label: string;
  value: number;
  direction: 'INCREASED_RISK' | 'DECREASED_RISK';
  magnitude: number;
  impactPercent: number;
}

export interface ExplainResult {
  alertId: string;
  transactionId: string;
  shapDrivers: ShapDriver[];
  auditSummary: string;
  llmModel: string;
  durationMs: number;
  usedFallback: boolean;
}

export interface AuditLogEntry {
  entityType: 'FRAUD_EVENT' | 'DISTRESS_SCORE';
  entityId: string;
  eventType: 'EXPLAINED' | 'SCORED' | 'INTERVENED' | 'RESOLVED';
  actor: string;
  payload: Record<string, any>;
}
