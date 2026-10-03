import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { getTestApp, teardownTestApp } from '../helpers/test-app.js';

describe('Functional: Standalone Auth (/v1/auth/login)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('authenticates valid credentials and issues a signed JWT with tenant context', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'analyst@aedis.bank',
        password: 'password123',
        tenantId: 'tenant_bank_alpha',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Authentication successful');
    expect(body.token).toBeTypeOf('string');
    expect(body.tenantId).toBe('tenant_bank_alpha');
    expect(body.expiresIn).toBe('8h');

    // Decode and verify JWT claims
    const decoded = app.jwt.decode<{
      sub: string;
      email: string;
      tenantId: string;
      roles: string[];
    }>(body.token);

    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe('user_analyst_01');
    expect(decoded?.email).toBe('analyst@aedis.bank');
    expect(decoded?.tenantId).toBe('tenant_bank_alpha');
    expect(decoded?.roles).toContain('RISK_ANALYST');
    expect(decoded?.roles).toContain('COMPLIANCE_OFFICER');
  });

  it('rejects incorrect password with HTTP 401 Unauthorized', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'analyst@aedis.bank',
        password: 'wrong_password_99',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid credentials');
  });

  it('rejects malformed email with HTTP 400 Validation Error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'not-an-email',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('rejects short password (<6 chars) with HTTP 400 Validation Error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'analyst@aedis.bank',
        password: '123',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Validation failed');
  });
});
