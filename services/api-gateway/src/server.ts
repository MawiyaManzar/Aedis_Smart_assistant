import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { transactionRoutes } from './routes/transactions.js';
import { alertRoutes } from './routes/alerts.js';
import { featureRoutes } from './routes/features.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { policyRoutes } from './routes/policy.js';
import { interventionRoutes } from './routes/interventions.js';
import { auditRoutes } from './routes/audit.js';
import { demoRoutes } from './routes/demo.js';
import { dashboardRoutes } from './routes/dashboard.js';

/**
 * App factory: Allows in-memory injection testing (zero network overhead in vitest)
 * as well as production server listening.
 */
export function buildApp(opts = {}): FastifyInstance {
  const isTest = process.env.NODE_ENV === 'test';
  const app = Fastify({
    logger: isTest
      ? false
      : {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        },
    ...opts,
  });

  // 1. Enable CORS for local Next.js dashboard
  app.register(cors, { origin: true });

  // 2. Register JWT Authentication
  app.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  // 3. Health Check route
  app.get('/health', async () => {
    return { status: 'UP', service: 'api-gateway', timestamp: new Date().toISOString() };
  });

  // 4. Register Feature Routes
  app.register(authRoutes, { prefix: '/v1/auth' });
  app.register(transactionRoutes, { prefix: '/v1/transactions' });
  app.register(alertRoutes, { prefix: '/v1/alerts' });
  app.register(featureRoutes, { prefix: '/v1/features' });
  app.register(telemetryRoutes, { prefix: '/v1/telemetry' });
  app.register(policyRoutes, { prefix: '/v1/policy' });
  app.register(interventionRoutes, { prefix: '/v1/interventions' });
  app.register(auditRoutes, { prefix: '/v1/audit' });
  app.register(demoRoutes, { prefix: '/v1/demo' });
  app.register(dashboardRoutes, { prefix: '/v1/dashboard' });


  return app;
}

async function start() {
  const app = buildApp();
  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`🚀 API Gateway running at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only start listening if executed directly, not when imported by test suites
if (process.env.NODE_ENV !== 'test') {
  start();
}
