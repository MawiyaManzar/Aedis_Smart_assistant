export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TransactionStatus = 'APPROVED' | 'FLAGGED' | 'BLOCKED' | 'PENDING_OTP';
export type InterventionType = 'SILENT_PASS' | 'STEP_UP_OTP' | 'ESCROW_FREEZE' | 'RESTRUCTURE_OFFER' | 'MANUAL_REVIEW';

export interface ShapDriver {
  feature: string;
  impact: number; // e.g. +34
  description: string;
}

export interface Transaction {
  id: string;
  timestamp: string;
  sender: {
    name: string;
    account: string;
    balance: number;
    avg14DayBalance: number;
    deviceId: string;
    ipAddress: string;
    city: string;
  };
  recipient: {
    name: string;
    account: string;
    isMuleCandidate: boolean;
    hopDepth: number;
    clusterId: string;
  };
  amount: number;
  riskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  status: TransactionStatus;
  intervention: InterventionType;
  shapDrivers: ShapDriver[];
  nlpExplanation: string;
  guardrailsVerified: boolean;
  onnxLatencyMs: number;
  graphHops: number;
  velocity?: {
    count1m: number;
    count1h: number;
    count24h: number;
    sumAmount1h: number;
  };
  fraudRingIds?: string[];
  modelVersion?: string;
  alertId?: string;
}

export interface BackendAlert {
  streamEntryId: string;
  alertId: string;
  transactionId: string;
  tenantId: string;
  status: 'BLOCKED' | 'FLAGGED';
  fraudScore: string;
  graphHops: string;
  fraudRingIds: string[];
  velocity: {
    count1m: number;
    count1h: number;
    count24h: number;
    sumAmount1h: number;
  };
  modelVersion: string;
  payload: {
    transactionId: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    currency: string;
    channel: string;
    deviceId?: string;
    ipAddress?: string;
    timestamp: string;
  };
  timestamp: string;
}

export interface VelocityMetrics {
  accountId: string;
  count1m: number;
  count1h: number;
  count24h: number;
  sumAmount1h: number;
}

export interface TelemetryData {
  service: string;
  status: string;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
  streams: {
    rawStreamLength: number;
    alertStreamLength: number;
    resolutionStreamLength: number;
    redisStatus: string;
    rawStream: string;
    alertStream: string;
  };
  slo: {
    targetLatencyMs: number;
    expectedOutcomeMs: number;
    graphHopTimeoutMs: number;
    mlInferenceTimeoutMs: number;
  };
  timestamp: string;
}


export interface BorrowerDistress {
  id: string;
  borrowerName: string;
  loanId: string;
  principalAmount: number;
  monthlyEmi: number;
  nextEmiDate: string;
  distressScore: number; // 0 - 100
  riskLevel: RiskLevel;
  cashReservesDropPct: number; // e.g. 82%
  atmWithdrawalMultiplier: number; // e.g. 4.0x
  newHighInterestSpikes: number; // count
  lightGbmConfidence: number; // 0.94
  status: 'HEALTHY' | 'EARLY_WARNING' | 'CRITICAL_DISTRESS' | 'INTERVENED';
  shapDrivers: ShapDriver[];
  nlpExplanation: string;
  recommendedAction: string;
  cashFlowHistory: Array<{ day: string; balance: number; withdrawals: number }>;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'ACCOUNT' | 'MULE' | 'DEVICE' | 'IP' | 'MERCHANT';
  riskScore: number;
  x: number;
  y: number;
  details: string;
}

export interface GraphLink {
  source: string;
  target: string;
  label: string;
  isHighRisk?: boolean;
}

export interface AuditRecord {
  id: string;
  txOrLoanId: string;
  timestamp: string;
  analyst: string;
  actionTaken: string;
  previousStatus: string;
  newStatus: string;
  shapDigest: string;
  nlpSummary: string;
  guardrailsHash: string;
  immutableBlock: string;
}

export type UserRole = 'SENTINEL' | 'CREDIT' | 'AUDITOR' | 'ARCHITECT' | 'SIMULATOR';

export interface AuthUser {
  sub: string;
  email: string;
  tenantId: string;
  roles: string[];
  token?: string;
  expiresAt?: number;
}

export interface Tenant {
  id: string;
  name: string;
  code: string;
  region: string;
  currency: string;
  status: 'ACTIVE' | 'ISOLATED' | 'MAINTENANCE';
}

export interface LoginCredentials {
  email: string;
  password: string;
  tenantId?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  tenantId: string;
  expiresIn: string;
  error?: string;
  details?: Record<string, unknown>;
}

