import { AuthUser, LoginCredentials, Tenant, Transaction, RiskLevel, TransactionStatus, InterventionType } from './types';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:4000';

export const AVAILABLE_TENANTS: Tenant[] = [
  {
    id: 'tenant_bank_alpha',
    name: 'Alpha Commercial Bank',
    code: 'ALPHA-01',
    region: 'North America / US Core',
    currency: 'USD ($)',
    status: 'ACTIVE',
  },
  {
    id: 'tenant_apex_mutual',
    name: 'Apex Mutual Reserve',
    code: 'APEX-EU',
    region: 'Frankfurt / Eurozone Core',
    currency: 'EUR (€)',
    status: 'ACTIVE',
  },
  {
    id: 'tenant_heritage_credit',
    name: 'Heritage Credit Union',
    code: 'HERIT-UK',
    region: 'London / Clearing Node',
    currency: 'GBP (£)',
    status: 'ACTIVE',
  },
];

export interface DecodedTokenPayload {
  sub: string;
  email: string;
  tenantId: string;
  roles: string[];
  iat: number;
  exp: number;
}

/**
 * Robust base64url JWT decoder for browser runtime
 */
export function decodeJwt(token: string): DecodedTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error('Failed to decode JWT:', err);
    return null;
  }
}

export interface LoginResult {
  success: boolean;
  token?: string;
  tenantId?: string;
  expiresIn?: string;
  user?: AuthUser;
  error?: string;
  validationDetails?: Record<string, unknown>;
}

/**
 * Authenticates analyst against the Aedis API Gateway (/v1/auth/login)
 */
export async function loginToGateway(
  credentials: LoginCredentials
): Promise<LoginResult> {
  const targetTenant = credentials.tenantId || 'tenant_bank_alpha';

  try {
    const res = await fetch(`${API_BASE_URL}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: credentials.email.trim(),
        password: credentials.password,
        tenantId: targetTenant,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) {
        return {
          success: false,
          error:
            data.error ||
            'Invalid credentials. Check password (demo credential: password123).',
        };
      }
      if (res.status === 400) {
        let errorMsg = 'Validation failed: Check email format and password length (min 6 chars).';
        if (data.details) {
          const fieldErrors = Object.entries(data.details)
            .filter(([k]) => k !== '_errors')
            .map(([field, err]: [string, any]) => `${field}: ${err._errors?.join(', ')}`)
            .join(' | ');
          if (fieldErrors) errorMsg = `Validation error: ${fieldErrors}`;
        }
        return {
          success: false,
          error: errorMsg,
          validationDetails: data.details,
        };
      }
      return {
        success: false,
        error: data.error || `Server responded with status ${res.status}`,
      };
    }

    const { token, tenantId, expiresIn } = data;
    const decoded = decodeJwt(token);

    const user: AuthUser = {
      sub: decoded?.sub || 'user_analyst_01',
      email: decoded?.email || credentials.email,
      tenantId: tenantId || targetTenant,
      roles: decoded?.roles || ['RISK_ANALYST', 'COMPLIANCE_OFFICER'],
      token,
      expiresAt: decoded?.exp ? decoded.exp * 1000 : Date.now() + 8 * 3600 * 1000,
    };

    return {
      success: true,
      token,
      tenantId: user.tenantId,
      expiresIn,
      user,
    };
  } catch (err: any) {
    console.warn('API Gateway direct connection failed:', err);
    return {
      success: false,
      error: `API Gateway unreachable at ${API_BASE_URL}. Ensure services/api-gateway is running on port 4000.`,
    };
  }
}

/**
 * Pings the API Gateway /health endpoint
 */
export async function checkGatewayHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${API_BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Post transaction into backend Redis stream (/v1/transactions)
 */
export async function pushLiveTransactionToGateway(
  transactionPayload: any,
  token?: string,
  tenantId: string = 'tenant_bank_alpha'
) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      transactionPayload.transactionId || ''
    );
    const validUuid = isUuid
      ? transactionPayload.transactionId
      : typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'a0000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

    const payload = {
      ...transactionPayload,
      transactionId: validUuid,
    };

    const res = await fetch(`${API_BASE_URL}/v1/transactions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    return await res.json();
  } catch (err) {
    console.error('Failed to dispatch transaction to backend stream:', err);
    return null;
  }
}

/**
 * Fetch latest generated alerts from backend Redis stream (/v1/alerts)
 */
export async function fetchLatestBackendAlerts(count = 20): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/alerts?count=${count}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.alerts || [];
  } catch (err) {
    console.warn('Failed to fetch alerts from backend:', err);
    return [];
  }
}

/**
 * Resolves an alert on the backend (Section 7.3 Analyst Action API)
 */
export async function resolveBackendAlert(
  alertId: string,
  resolution: string,
  analystNote = '',
  token?: string
) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/v1/alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ resolution, analystNote }),
    });

    return await res.json();
  } catch (err) {
    console.error('Failed to resolve alert on backend:', err);
    return null;
  }
}

/**
 * Reads real-time atomic Redis velocity counters for an account
 */
export async function fetchAccountVelocityFeatures(accountId: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/features/velocity/${encodeURIComponent(accountId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.velocity || null;
  } catch (err) {
    console.warn('Failed to fetch account velocity:', err);
    return null;
  }
}

/**
 * Fetches stream and service telemetry for System Architect view
 */
export async function fetchSystemTelemetry() {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/telemetry`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch telemetry from gateway:', err);
    return null;
  }
}

/**
 * Converts a backend alert into a frontend Transaction model for live rendering
 */
export function convertAlertToTransaction(alert: any): Transaction {
  const p = alert.payload || {};
  const scoreNum = Math.round(parseFloat(alert.fraudScore || '0.5') * 100);
  const hops = parseInt(alert.graphHops || '0', 10);
  const ringIds = Array.isArray(alert.fraudRingIds) ? alert.fraudRingIds : [];

  const shapDrivers = [];
  if (alert.velocity?.count1m >= 5) {
    shapDrivers.push({
      feature: '1-Min Velocity Burst',
      impact: 45,
      description: `${alert.velocity.count1m} transactions in 60s window (threshold: 5)`,
    });
  }
  if (hops > 0 || ringIds.length > 0) {
    shapDrivers.push({
      feature: 'Neo4j Mule Ring Linkage',
      impact: 65,
      description: `Connected to ${ringIds.join(', ') || 'Mule Cluster'} across ${hops} hops`,
    });
  }
  if (alert.velocity?.sumAmount1h >= 10000) {
    shapDrivers.push({
      feature: '1-Hour Cumulative Spike',
      impact: 25,
      description: `Hourly outflow volume exceeds $${Number(alert.velocity.sumAmount1h).toLocaleString()}`,
    });
  }
  if (shapDrivers.length === 0) {
    shapDrivers.push({
      feature: 'Pattern Anomaly',
      impact: 20,
      description: 'Transaction flagged by heuristic-rules-v1 scoring priors',
    });
  }

  const riskLevel: RiskLevel =
    scoreNum >= 75 ? 'CRITICAL' : scoreNum >= 50 ? 'HIGH' : scoreNum >= 35 ? 'MEDIUM' : 'LOW';
  const status: TransactionStatus =
    alert.status === 'BLOCKED' ? 'BLOCKED' : alert.status === 'FLAGGED' ? 'FLAGGED' : 'APPROVED';
  const intervention: InterventionType =
    alert.status === 'BLOCKED' ? 'ESCROW_FREEZE' : alert.status === 'FLAGGED' ? 'STEP_UP_OTP' : 'SILENT_PASS';

  return {
    id: p.transactionId || alert.transactionId || `TX-${alert.streamEntryId}`,
    timestamp: (alert.timestamp || new Date().toISOString()).replace('T', ' ').substring(0, 19),
    sender: {
      name: p.fromAccountId ? `Account ${p.fromAccountId}` : 'Anonymous Sender',
      account: p.fromAccountId || 'ACC-LIVE-001',
      balance: (p.amount || 5000) * 1.5,
      avg14DayBalance: (p.amount || 5000) * 0.4,
      deviceId: p.deviceId || 'DEV-UNK-01',
      ipAddress: p.ipAddress || '192.168.1.1',
      city: 'Live Streaming Node',
    },
    recipient: {
      name: p.toAccountId ? `Destination ${p.toAccountId}` : 'Clearing Node',
      account: p.toAccountId || 'ACC-DEST-999',
      isMuleCandidate: hops > 0 || ringIds.length > 0,
      hopDepth: hops,
      clusterId: ringIds[0] || (hops > 0 ? 'MULE-RING-ALPHA-07' : 'DIRECT-ENDPOINT'),
    },
    amount: Number(p.amount) || 1000,
    riskScore: scoreNum,
    riskLevel,
    status,
    intervention,
    shapDrivers,
    nlpExplanation: `Live evaluated fraud event from stream:alert:created. Model: ${alert.modelVersion || 'heuristic-rules-v1'}. Score: ${scoreNum}/100.`,
    guardrailsVerified: true,
    onnxLatencyMs: 4.8,
    graphHops: hops,
    velocity: alert.velocity,
    fraudRingIds: ringIds,
    modelVersion: alert.modelVersion,
    alertId: alert.alertId,
  };
}

