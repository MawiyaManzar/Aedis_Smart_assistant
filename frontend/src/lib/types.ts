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
  /** Where riskScore came from. Omitted means the ML model. */
  scoreSource?: 'MODEL' | 'HEURISTIC';
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
  /** Where distressScore came from. Omitted means the ML model. */
  scoreSource?: 'MODEL' | 'HEURISTIC';
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
