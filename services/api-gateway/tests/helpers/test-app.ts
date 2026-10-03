import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server.js';
import { redis } from '../../src/redis.js';

let appInstance: FastifyInstance | null = null;

/**
 * Returns a shared Fastify application instance initialized for testing
 */
export async function getTestApp(): Promise<FastifyInstance> {
  if (!appInstance) {
    appInstance = buildApp({ logger: false });
    await appInstance.ready();
  }
  return appInstance;
}

/**
 * Gracefully shuts down test instances and closes Redis socket
 */
export async function teardownTestApp(): Promise<void> {
  if (appInstance) {
    await appInstance.close();
    appInstance = null;
  }
  // Disconnect Redis to prevent test runner hanging on open socket
  if (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'connect') {
    await redis.quit();
  }
}
