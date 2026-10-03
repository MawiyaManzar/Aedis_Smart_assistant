import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  tenantId: z.string().default('tenant_bank_alpha'),
});

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/login', async (request, reply) => {
    // 1. Validate request body
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const { email, password, tenantId } = parseResult.data;

    // 2. Demo credential check (for hackathon standalone auth)
    // In production this checks hashed password against Postgres
    if (password !== 'password123') {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // 3. Issue JWT with bank tenant context and user role
    const token = fastify.jwt.sign(
      {
        sub: 'user_analyst_01',
        email,
        tenantId,
        roles: ['RISK_ANALYST', 'COMPLIANCE_OFFICER'],
      },
      { expiresIn: '8h' }
    );

    return reply.status(200).send({
      message: 'Authentication successful',
      token,
      tenantId,
      expiresIn: '8h',
    });
  });
};
