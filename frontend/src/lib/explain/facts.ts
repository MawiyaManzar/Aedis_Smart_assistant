import { BorrowerDistress, Transaction } from "@/lib/types";
import { ExplainFacts, ExplainMetric } from "./types";

export const isValidScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const FRAUD_SCALE =
  "0-100 risk score. Below 35 is low, 35-49 medium, 50-74 high, 75 and above critical (blocked).";
const LOAN_SCALE =
  "0-100 distress score. 65 and above triggers pre-default outreach (danger cutoff 65).";

export function buildFraudFacts(tx: Transaction): ExplainFacts {
  const metrics: ExplainMetric[] = [{ label: "Transaction amount", value: usd(tx.amount) }];
  if (Number.isFinite(tx.sender.avg14DayBalance) && tx.sender.avg14DayBalance > 0) {
    metrics.push({ label: "Sender 14-day average balance", value: usd(tx.sender.avg14DayBalance) });
    metrics.push({
      label: "Amount versus 14-day average balance",
      value: `${(tx.amount / tx.sender.avg14DayBalance).toFixed(1)}x`,
    });
  }
  metrics.push({
    label: "Recipient linked to a known mule network",
    value: tx.recipient.isMuleCandidate ? "yes" : "no",
  });
  if (tx.graphHops > 0) {
    metrics.push({ label: "Graph hops to the flagged cluster", value: String(tx.graphHops) });
    metrics.push({ label: "Cluster", value: tx.recipient.clusterId });
  }
  return {
    kind: "FRAUD",
    entityId: tx.id,
    scoreSource: tx.scoreSource ?? "MODEL",
    score: isValidScore(tx.riskScore) ? tx.riskScore : null,
    riskLevel: tx.riskLevel,
    status: tx.status,
    scale: FRAUD_SCALE,
    metrics,
    drivers: tx.shapDrivers.map((d) => ({
      feature: d.feature,
      impact: d.impact,
      description: d.description,
    })),
  };
}

export function buildLoanFacts(b: BorrowerDistress): ExplainFacts {
  const metrics: ExplainMetric[] = [
    { label: "Monthly EMI", value: usd(b.monthlyEmi) },
    { label: "Next EMI due", value: b.nextEmiDate },
    { label: "Cash reserves drop over 14 days", value: `${b.cashReservesDropPct}%` },
    { label: "ATM withdrawals versus normal", value: `${b.atmWithdrawalMultiplier}x` },
    { label: "New high-interest credit events", value: String(b.newHighInterestSpikes) },
  ];
  const history = b.cashFlowHistory;
  if (history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];
    metrics.push({ label: `Balance on ${first.day}`, value: usd(first.balance) });
    metrics.push({ label: `Balance on ${last.day}`, value: usd(last.balance) });
  }
  if (Number.isFinite(b.lightGbmConfidence)) {
    metrics.push({
      label: "Model confidence",
      value: `${Math.round(b.lightGbmConfidence * 100)}%`,
    });
  }
  return {
    kind: "LOAN",
    entityId: b.loanId,
    scoreSource: b.scoreSource ?? "MODEL",
    score: isValidScore(b.distressScore) ? b.distressScore : null,
    riskLevel: b.riskLevel,
    status: b.status,
    scale: LOAN_SCALE,
    metrics,
    drivers: b.shapDrivers.map((d) => ({
      feature: d.feature,
      impact: d.impact,
      description: d.description,
    })),
  };
}
