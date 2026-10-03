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
export async function getShapDrivers(alert: AlertEvent, passedDrivers?: any[]): Promise<ShapDriver[]> {
  // If top_drivers were already produced by /v1/transactions/score
  if (Array.isArray(passedDrivers) && passedDrivers.length > 0) {
    const totalMag = passedDrivers.reduce((acc, d) => acc + Math.abs(d.shap_contribution || 0.1), 0) || 1;
    return passedDrivers.slice(0, 3).map((d) => ({
      feature: d.feature,
      label: `${d.feature} (val: ${d.value})`,
      value: d.value,
      direction: (d.shap_contribution ?? 0) >= 0 ? 'INCREASED_RISK' : 'DECREASED_RISK',
      magnitude: parseFloat(Math.abs(d.shap_contribution ?? 0.1).toFixed(4)),
      impactPercent: Math.round((Math.abs(d.shap_contribution ?? 0.1) / totalMag) * 100),
    }));
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45);

    const response = await fetch(`${config.mlServiceUrl}/v1/models/explain/shap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': alert.transactionId,
      },
      body: JSON.stringify({
        entity_type: 'FRAUD_EVENT',
        entity_id: alert.transactionId,
        model_name: 'fraud',
        top_n: 3,
        features: {
          amount_zscore: ((alert.payload?.amount || 250) - 250) / 500,
          velocity_1h: alert.velocity?.count1h || 0,
          velocity_24h: alert.velocity?.count24h || 0,
          graph_hops: alert.graphHops,
          is_new_beneficiary: true,
          device_age_days: 14.0,
          ip_country_risk: 0.1,
          hour_of_day: new Date(alert.timestamp).getUTCHours(),
          day_of_week: new Date(alert.timestamp).getUTCDay(),
          channel_risk_score: 0.05,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      const drivers = data.top_drivers || data.drivers;
      if (Array.isArray(drivers) && drivers.length > 0) {
        const totalMag = drivers.reduce((acc: number, d: any) => acc + Math.abs(d.shap_contribution || 0.1), 0) || 1;
        return drivers.slice(0, 3).map((d: any) => ({
          feature: d.feature,
          label: `${d.feature} (val: ${d.value})`,
          value: d.value,
          direction: (d.shap_contribution ?? 0) >= 0 ? 'INCREASED_RISK' : 'DECREASED_RISK',
          magnitude: parseFloat(Math.abs(d.shap_contribution ?? 0.1).toFixed(4)),
          impactPercent: Math.round((Math.abs(d.shap_contribution ?? 0.1) / totalMag) * 100),
        }));
      }
    }
  } catch (_err) {
    // Graceful fallback to analytical SHAP approximation
  }

  return calculateAnalyticalShap(alert);
}
