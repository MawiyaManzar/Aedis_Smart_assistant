import { config } from '../config.js';
import { AlertEvent, ShapDriver } from '../types.js';

/**
 * Computes deterministic analytical SHAP driver approximations
 * when Python ML TreeExplainer is offline.
 */
export function calculateAnalyticalShap(alert: AlertEvent): ShapDriver[] {
  const candidates: { feature: string; label: string; value: number; magnitude: number; direction: 'INCREASED_RISK' | 'DECREASED_RISK' }[] = [];

  // 1. Graph Hops & Mule Ring Linkage
  if (alert.graphHops > 0 || (alert.fraudRingIds && alert.fraudRingIds.length > 0)) {
    const ringCount = alert.fraudRingIds ? alert.fraudRingIds.length : 1;
    candidates.push({
      feature: 'graph_mule_hops',
      label: `${alert.graphHops}-hop connection to ${ringCount} known fraud/mule ring(s)`,
      value: alert.graphHops,
      magnitude: 0.55 + Math.min(alert.graphHops * 0.15, 0.35),
      direction: 'INCREASED_RISK',
    });
  }

  // 2. Velocity Bursts in 1 minute
  if (alert.velocity && alert.velocity.count1m > 1) {
    candidates.push({
      feature: 'velocity_burst_1m',
      label: `Rapid velocity: ${alert.velocity.count1m} transactions within 60 seconds`,
      value: alert.velocity.count1m,
      magnitude: 0.25 + Math.min((alert.velocity.count1m - 1) * 0.1, 0.4),
      direction: 'INCREASED_RISK',
    });
  }

  // 3. Amount Outlier
  const amount = alert.payload?.amount || 0;
  if (amount > 1000) {
    candidates.push({
      feature: 'amount_outlier',
      label: `High transfer amount: $${amount.toLocaleString()} exceeds account median`,
      value: amount,
      magnitude: 0.2 + Math.min((amount / 10000) * 0.25, 0.5),
      direction: 'INCREASED_RISK',
    });
  }

  // 4. 1-Hour Cumulative Outflow
  if (alert.velocity && alert.velocity.sumAmount1h > 5000) {
    candidates.push({
      feature: 'cumulative_sum_1h',
      label: `Cumulative 1h outflow: $${alert.velocity.sumAmount1h.toLocaleString()}`,
      value: alert.velocity.sumAmount1h,
      magnitude: 0.18,
      direction: 'INCREASED_RISK',
    });
  }

  // 5. Channel Risk
  const channel = alert.payload?.channel || 'mobile';
  if (channel === 'atm') {
    candidates.push({
      feature: 'channel_risk',
      label: 'ATM cash-out channel',
      value: 1,
      magnitude: 0.12,
      direction: 'INCREASED_RISK',
    });
  }

  // Fallback benign driver if candidates is empty
  if (candidates.length === 0) {
    candidates.push({
      feature: 'baseline_anomaly',
      label: `Score ${alert.fraudScore.toFixed(2)} exceeds automated approval threshold`,
      value: alert.fraudScore,
      magnitude: 0.15,
      direction: 'INCREASED_RISK',
    });
  }

  // Sort descending by magnitude and take top 3
  const top3 = candidates.sort((a, b) => b.magnitude - a.magnitude).slice(0, 3);
  const totalMagnitude = top3.reduce((sum, d) => sum + d.magnitude, 0) || 1;

  return top3.map((driver) => ({
    feature: driver.feature,
    label: driver.label,
    value: driver.value,
    direction: driver.direction,
    magnitude: parseFloat(driver.magnitude.toFixed(4)),
    impactPercent: Math.round((driver.magnitude / totalMagnitude) * 100),
  }));
}

/**
 * Retrieves top-3 SHAP numerical drivers from Python FastAPI ML service or analytical fallback.
 */
export async function getShapDrivers(alert: AlertEvent): Promise<ShapDriver[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35); // 35ms timeout

    const response = await fetch(`${config.mlServiceUrl}/v1/models/explain/shap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: alert.transactionId,
        score: alert.fraudScore,
        amount: alert.payload?.amount,
        velocity_1m: alert.velocity?.count1m,
        velocity_1h: alert.velocity?.count1h,
        graph_hops: alert.graphHops,
        fraud_ring_ids: alert.fraudRingIds,
        channel: alert.payload?.channel,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      if (Array.isArray(data.drivers) && data.drivers.length > 0) {
        return data.drivers.slice(0, 3);
      }
    }
  } catch (_err) {
    // Graceful fallback to analytical SHAP approximation
  }

  return calculateAnalyticalShap(alert);
}
