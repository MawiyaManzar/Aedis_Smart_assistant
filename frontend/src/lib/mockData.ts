import { Transaction, BorrowerDistress, GraphNode, GraphLink, AuditRecord } from './types';

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: "TX-SEC-9042",
    timestamp: "2026-10-03 21:52:18",
    sender: {
      name: "Tariq Al-Mansoor",
      account: "ACC-US-481903",
      balance: 145000,
      avg14DayBalance: 12000,
      deviceId: "DEV-HW-8812A",
      ipAddress: "197.34.12.89",
      city: "Metro Region"
    },
    recipient: {
      name: "Apex Shell Holdings LLC",
      account: "ACC-US-990142",
      isMuleCandidate: true,
      hopDepth: 3,
      clusterId: "MULE-RING-ALPHA-07"
    },
    amount: 142000,
    riskScore: 87,
    riskLevel: "HIGH",
    status: "BLOCKED",
    intervention: "ESCROW_FREEZE",
    shapDrivers: [
      { feature: "Amount Velocity", impact: 34, description: "Amount is 18× higher than 14-day average" },
      { feature: "Beneficiary Anomaly", impact: 21, description: "New beneficiary added under 8 mins ago" },
      { feature: "Circadian Context", impact: 14, description: "Unusual transaction time (03:52 AM local)" },
      { feature: "Graph Topology", impact: 10, description: "Recipient linked to identified Mule Ring (3 hops)" },
      { feature: "Session Biometrics", impact: 8, description: "Rapid transfer immediately after credential reset" }
    ],
    nlpExplanation: "High-probability account wipeout detected. Total account drain triggered within 8 minutes of password modification to a node identified in the Alpha Mule cluster.",
    guardrailsVerified: true,
    onnxLatencyMs: 38.4,
    graphHops: 3
  },
  {
    id: "TX-SEC-9043",
    timestamp: "2026-10-03 21:53:02",
    sender: {
      name: "Farida El-Sayed",
      account: "ACC-US-102948",
      balance: 62000,
      avg14DayBalance: 58000,
      deviceId: "DEV-IPH-9921B",
      ipAddress: "156.204.81.14",
      city: "Coastal District"
    },
    recipient: {
      name: "Delta Telecom Services",
      account: "ACC-US-001488",
      isMuleCandidate: false,
      hopDepth: 0,
      clusterId: "LEGIT-UTILITY-01"
    },
    amount: 850,
    riskScore: 12,
    riskLevel: "LOW",
    status: "APPROVED",
    intervention: "SILENT_PASS",
    shapDrivers: [
      { feature: "Amount Regularity", impact: -18, description: "Matches recurring monthly utility bill history" },
      { feature: "Device Stability", impact: -12, description: "Known hardware hash used for 340+ days" },
      { feature: "Verified Endpoint", impact: -10, description: "Regulated telecom corporate merchant ID" }
    ],
    nlpExplanation: "Legitimate automated utility payment. Sender has regular 12-month clearing record on identical merchant route.",
    guardrailsVerified: true,
    onnxLatencyMs: 24.1,
    graphHops: 0
  },
  {
    id: "TX-SEC-9044",
    timestamp: "2026-10-03 21:53:45",
    sender: {
      name: "Karim Hassan",
      account: "ACC-US-773192",
      balance: 38000,
      avg14DayBalance: 35000,
      deviceId: "DEV-AND-4402Z",
      ipAddress: "41.233.10.55",
      city: "Urban Central"
    },
    recipient: {
      name: "P2P Crypto Escrow Gate",
      account: "ACC-US-550183",
      isMuleCandidate: true,
      hopDepth: 1,
      clusterId: "MULE-RING-BETA-03"
    },
    amount: 19500,
    riskScore: 68,
    riskLevel: "MEDIUM",
    status: "PENDING_OTP",
    intervention: "STEP_UP_OTP",
    shapDrivers: [
      { feature: "Channel Shift", impact: 26, description: "First-time transfer to high-velocity P2P exchange" },
      { feature: "IP Geolocation", impact: 19, description: "IP routed through non-standard ISP gateway" },
      { feature: "Temporal Spacing", impact: 14, description: "3rd consecutive outgoing transfer within 1 hour" },
      { feature: "Historical Trust", impact: -11, description: "Account age > 4 years with no past chargebacks" }
    ],
    nlpExplanation: "Suspicious P2P velocity burst. Requires biometric/SMS Step-Up verification before funds release.",
    guardrailsVerified: true,
    onnxLatencyMs: 31.7,
    graphHops: 1
  },
  {
    id: "TX-SEC-9045",
    timestamp: "2026-10-03 21:54:19",
    sender: {
      name: "Nouran Mansour",
      account: "ACC-US-331094",
      balance: 89000,
      avg14DayBalance: 85000,
      deviceId: "DEV-MAC-1104K",
      ipAddress: "196.151.72.04",
      city: "Capital Hub"
    },
    recipient: {
      name: "Continental Grain Importers",
      account: "ACC-US-882109",
      isMuleCandidate: false,
      hopDepth: 0,
      clusterId: "LEGIT-B2B-09"
    },
    amount: 14000,
    riskScore: 24,
    riskLevel: "LOW",
    status: "APPROVED",
    intervention: "SILENT_PASS",
    shapDrivers: [
      { feature: "B2B Whitelist", impact: -15, description: "Established trade corridor with verified invoice" },
      { feature: "Balance Cushion", impact: -12, description: "Post-transaction balance remains healthy" }
    ],
    nlpExplanation: "Commercial invoice settlement authorized. Standard supply chain clearing parameters validated.",
    guardrailsVerified: true,
    onnxLatencyMs: 27.8,
    graphHops: 0
  },
  {
    id: "TX-SEC-9046",
    timestamp: "2026-10-03 21:55:10",
    sender: {
      name: "Moustafa Zahran",
      account: "ACC-US-661203",
      balance: 92000,
      avg14DayBalance: 14000,
      deviceId: "DEV-EMU-0091X",
      ipAddress: "102.164.20.199",
      city: "Port Gateway"
    },
    recipient: {
      name: "Rapid Remit Intermediary",
      account: "ACC-US-998811",
      isMuleCandidate: true,
      hopDepth: 4,
      clusterId: "MULE-RING-ALPHA-07"
    },
    amount: 91500,
    riskScore: 94,
    riskLevel: "CRITICAL",
    status: "BLOCKED",
    intervention: "ESCROW_FREEZE",
    shapDrivers: [
      { feature: "Device Spoofing", impact: 38, description: "Virtual Android Emulator environment detected" },
      { feature: "Micro-Dumping Flow", impact: 28, description: "Follows 7 micro-deposits totaling 92k within 30m" },
      { feature: "Known Smurfing Ring", impact: 20, description: "Shared beneficiary device with 14 banned wallets" },
      { feature: "Zero Cooling Period", impact: 12, description: "Immediate outbound transfer upon deposit confirmation" }
    ],
    nlpExplanation: "Critical mule smurfing cycle in progress. Virtual hardware environment attempting instant extraction of structured micro-deposits.",
    guardrailsVerified: true,
    onnxLatencyMs: 41.2,
    graphHops: 4
  }
];

export const INITIAL_BORROWER_DISTRESS: BorrowerDistress[] = [
  {
    id: "BORROWER-SME-0418",
    borrowerName: "David Al-Mansoor (Al-Mansoor Enterprises)",
    loanId: "LN-COMM-418-FACILITY",
    principalAmount: 320000,
    monthlyEmi: 18400,
    nextEmiDate: "2026-10-12",
    distressScore: 78,
    riskLevel: "HIGH",
    cashReservesDropPct: 82,
    atmWithdrawalMultiplier: 4.0,
    newHighInterestSpikes: 3,
    lightGbmConfidence: 0.94,
    status: "CRITICAL_DISTRESS",
    shapDrivers: [
      { feature: "cash_reserves_drop", impact: 44, description: "Cash reserves dropped 82% over 14 days" },
      { feature: "atm_spikes", impact: 28, description: "ATM cash-out withdrawals spiked 4x above baseline" },
      { feature: "revenue_stagnation", impact: 18, description: "Merchant receivables down 35% MoM" }
    ],
    nlpExplanation: "Default risk 78%: Cash reserves dropped 82% over 14 days and ATM withdrawals spiked 4x.",
    recommendedAction: "Dispatch Automated Restructuring Playbook #3 (3-month interest-only moratorium offer via WhatsApp/SMS).",
    cashFlowHistory: [
      { day: "Day 1", balance: 210000, withdrawals: 5000 },
      { day: "Day 3", balance: 175000, withdrawals: 12000 },
      { day: "Day 6", balance: 120000, withdrawals: 25000 },
      { day: "Day 9", balance: 80000, withdrawals: 32000 },
      { day: "Day 12", balance: 45000, withdrawals: 28000 },
      { day: "Day 14", balance: 37800, withdrawals: 14000 }
    ]
  },
  {
    id: "BOR-CRD-501",
    borrowerName: "Ahmed Radwan",
    loanId: "LN-SME-7892-METRO",
    principalAmount: 250000,
    monthlyEmi: 14200,
    nextEmiDate: "2026-10-10",
    distressScore: 78,
    riskLevel: "HIGH",
    cashReservesDropPct: 82,
    atmWithdrawalMultiplier: 4.2,
    newHighInterestSpikes: 3,
    lightGbmConfidence: 0.94,
    status: "CRITICAL_DISTRESS",
    shapDrivers: [
      { feature: "Reserve Depletion", impact: 36, description: "Cash reserves dropped 82% over the last 14 days" },
      { feature: "ATM Extraction Spike", impact: 24, description: "ATM cash withdrawals spiked 4.2× above personal baseline" },
      { feature: "Secondary Debt Spikes", impact: 18, description: "3 inquiries with high-cost payday micro-lenders detected" },
      { feature: "Payroll Absence", impact: 12, description: "Primary salary inflow missed on expected 1st-of-month window" }
    ],
    nlpExplanation: "Default risk 78%: Cash reserves dropped 82% over 14 days and ATM withdrawals spiked 4.2x. High probability of missed EMI on October 10.",
    recommendedAction: "Dispatch Automated Restructuring Playbook #3 (3-month interest-only moratorium offer via WhatsApp/SMS).",
    cashFlowHistory: [
      { day: "Day 1", balance: 180000, withdrawals: 4000 },
      { day: "Day 3", balance: 155000, withdrawals: 8000 },
      { day: "Day 6", balance: 110000, withdrawals: 18000 },
      { day: "Day 9", balance: 75000, withdrawals: 24000 },
      { day: "Day 12", balance: 42000, withdrawals: 22000 },
      { day: "Day 14", balance: 32400, withdrawals: 9600 }
    ]
  },
  {
    id: "BOR-CRD-502",
    borrowerName: "Yasmin Abdel-Nasser",
    loanId: "LN-AUTO-3319-COAST",
    principalAmount: 120000,
    monthlyEmi: 5800,
    nextEmiDate: "2026-10-14",
    distressScore: 61,
    riskLevel: "MEDIUM",
    cashReservesDropPct: 54,
    atmWithdrawalMultiplier: 2.1,
    newHighInterestSpikes: 1,
    lightGbmConfidence: 0.89,
    status: "EARLY_WARNING",
    shapDrivers: [
      { feature: "Buffer Compression", impact: 28, description: "Operating liquidity fell 54% over prior 21-day cycle" },
      { feature: "Discretionary Overspend", impact: 19, description: "Merchant card spend up 35% in high-risk categories" },
      { feature: "Tenure Stability", impact: -14, description: "24-month flawless prior repayment history" }
    ],
    nlpExplanation: "Early warning: Operating liquidity reduced by 54%. Pre-emptive automated payment reminder & partial debit buffer recommended.",
    recommendedAction: "Trigger Pre-Default Soft Outreach (SMS notification + split-payment scheduling).",
    cashFlowHistory: [
      { day: "Day 1", balance: 64000, withdrawals: 2000 },
      { day: "Day 3", balance: 59000, withdrawals: 3500 },
      { day: "Day 6", balance: 51000, withdrawals: 4200 },
      { day: "Day 9", balance: 42000, withdrawals: 6100 },
      { day: "Day 12", balance: 34000, withdrawals: 5000 },
      { day: "Day 14", balance: 29440, withdrawals: 4560 }
    ]
  },
  {
    id: "BOR-CRD-503",
    borrowerName: "Hossam Gohar",
    loanId: "LN-MORT-9912-METRO",
    principalAmount: 850000,
    monthlyEmi: 32000,
    nextEmiDate: "2026-10-20",
    distressScore: 18,
    riskLevel: "LOW",
    cashReservesDropPct: 6,
    atmWithdrawalMultiplier: 0.9,
    newHighInterestSpikes: 0,
    lightGbmConfidence: 0.97,
    status: "HEALTHY",
    shapDrivers: [
      { feature: "Strong Liquidity Buffer", impact: -30, description: "Current liquid reserves cover 9.4x monthly EMI" },
      { feature: "Consistent Inflow", impact: -22, description: "Corporate dividend and salary verified 2 days ago" }
    ],
    nlpExplanation: "Borrower financial health optimal. Cash reserves exceed 9 months of debt service with negligible leverage changes.",
    recommendedAction: "Maintain standard auto-debit schedule. Eligible for premium credit line expansion.",
    cashFlowHistory: [
      { day: "Day 1", balance: 310000, withdrawals: 5000 },
      { day: "Day 3", balance: 305000, withdrawals: 4000 },
      { day: "Day 6", balance: 298000, withdrawals: 6000 },
      { day: "Day 9", balance: 340000, withdrawals: 7000 },
      { day: "Day 12", balance: 330000, withdrawals: 4500 },
      { day: "Day 14", balance: 322000, withdrawals: 8000 }
    ]
  }
];

export const INITIAL_GRAPH_NODES: GraphNode[] = [
  { id: "acc_victim_david_882", label: "David Al-Mansoor (Target)", type: "ACCOUNT", riskScore: 94, x: 100, y: 100, details: "Wiped $48,500 after 3 micro-probes" },
  { id: "acc_mule_ring_delta", label: "Alpha Mule Ring Delta", type: "MULE", riskScore: 97, x: 260, y: 70, details: "Target of $48.5k exfiltration" },
  { id: "DEV-ROOTED-89X", label: "Device ROOTED-89X", type: "DEVICE", riskScore: 92, x: 160, y: 220, details: "Rooted Android Kernel Signature" },
  { id: "ACC-US-481903", label: "Tariq Al-Mansoor (Victim)", type: "ACCOUNT", riskScore: 87, x: 120, y: 180, details: "Wiped $142,000 in 8 mins" },
  { id: "ACC-US-990142", label: "Apex Shell Holdings", type: "MULE", riskScore: 94, x: 280, y: 120, details: "Mule Ring Primary Hub" },
  { id: "DEV-HW-8812A", label: "Device HW-8812A", type: "DEVICE", riskScore: 89, x: 180, y: 320, details: "Hardware ID linked to 3 accounts" },
  { id: "IP-197.34.12.89", label: "IP 197.34.12.89 (Relay)", type: "IP", riskScore: 72, x: 100, y: 440, details: "Tor exit relay detected" },
  { id: "ACC-US-998811", label: "Rapid Remit Intermediary", type: "MULE", riskScore: 96, x: 440, y: 180, details: "High-speed multi-outflow funnel" },
  { id: "ACC-US-550183", label: "P2P Crypto Escrow Gate", type: "MULE", riskScore: 68, x: 380, y: 340, details: "Rapid off-ramp conversion" },
  { id: "DEV-EMU-0091X", label: "Android Emulator 0091X", type: "DEVICE", riskScore: 98, x: 520, y: 300, details: "Spoofed IMEI & MAC" },
  { id: "MERCH-CORP-09", label: "Continental Grain Importers", type: "MERCHANT", riskScore: 14, x: 620, y: 140, details: "Verified B2B Clearing Endpoint" }
];

export const INITIAL_GRAPH_LINKS: GraphLink[] = [
  { source: "acc_victim_david_882", target: "acc_mule_ring_delta", label: "Wipeout: $48,500 (Mobile)", isHighRisk: true },
  { source: "acc_victim_david_882", target: "DEV-ROOTED-89X", label: "Infiltration Device", isHighRisk: true },
  { source: "acc_mule_ring_delta", target: "ACC-US-990142", label: "Hop 2: Ring Aggregation", isHighRisk: true },
  { source: "ACC-US-481903", target: "ACC-US-990142", label: "TX: $142,000 (8m)", isHighRisk: true },
  { source: "ACC-US-481903", target: "DEV-HW-8812A", label: "Shared Device Fingerprint", isHighRisk: true },
  { source: "DEV-HW-8812A", target: "IP-197.34.12.89", label: "Session IP Binding", isHighRisk: false },
  { source: "ACC-US-990142", target: "ACC-US-998811", label: "Hop 2: Mule Dispersion ($91.5k)", isHighRisk: true },
  { source: "ACC-US-998811", target: "DEV-EMU-0091X", label: "Controlled By Botfarm", isHighRisk: true },
  { source: "ACC-US-990142", target: "ACC-US-550183", label: "Hop 2: Crypto Off-Ramp", isHighRisk: true },
  { source: "ACC-US-998811", target: "MERCH-CORP-09", label: "Attempted Fake Invoicing", isHighRisk: false }
];

export const INITIAL_AUDIT_LOGS: AuditRecord[] = [
  {
    id: "AUDIT-SEC-001",
    txOrLoanId: "TX-SEC-9042",
    timestamp: "2026-10-03 21:52:19",
    analyst: "SENTINEL-AUTO-AI",
    actionTaken: "AUTO_ESCROW_FREEZE",
    previousStatus: "PENDING_ML_SCORE",
    newStatus: "BLOCKED",
    shapDigest: "TOP3: [Amount Velocity +34, Beneficiary Anomaly +21, Circadian +14]",
    nlpSummary: "Account wipeout pattern identified. 18x velocity spike to flagged Alpha Mule Cluster.",
    guardrailsHash: "0x9F4C...B821",
    immutableBlock: "#Block-8812903"
  },
  {
    id: "AUDIT-SEC-002",
    txOrLoanId: "BOR-CRD-501",
    timestamp: "2026-10-03 21:50:00",
    analyst: "CREDIT-RISK-CRON",
    actionTaken: "DISPATCH_RESTRUCTURING_P3",
    previousStatus: "MONITORED",
    newStatus: "CRITICAL_DISTRESS",
    shapDigest: "TOP3: [Reserve Depletion +36, ATM Spike +24, Secondary Debt +18]",
    nlpSummary: "Default risk 78%: Cash reserves dropped 82% over 14 days and ATM withdrawals spiked 4.2x.",
    guardrailsHash: "0x3A81...7CE0",
    immutableBlock: "#Block-8812899"
  },
  {
    id: "AUDIT-SEC-003",
    txOrLoanId: "TX-SEC-9044",
    timestamp: "2026-10-03 21:53:46",
    analyst: "POLICY-ENGINE-V4",
    actionTaken: "TRIGGER_STEP_UP_OTP",
    previousStatus: "RECEIVED",
    newStatus: "PENDING_OTP",
    shapDigest: "TOP3: [Channel Shift +26, IP Geolocation +19, Temporal Spacing +14]",
    nlpSummary: "Suspicious P2P velocity burst. Biometric/SMS step-up authentication challenge dispatched.",
    guardrailsHash: "0x11BC...EE42",
    immutableBlock: "#Block-8812905"
  }
];
