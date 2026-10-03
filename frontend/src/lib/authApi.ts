import { AuthUser, LoginCredentials, Tenant } from './types';

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

    const res = await fetch(`${API_BASE_URL}/v1/transactions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(transactionPayload),
    });

    return await res.json();
  } catch (err) {
    console.error('Failed to dispatch transaction to backend stream:', err);
    return null;
  }
}
