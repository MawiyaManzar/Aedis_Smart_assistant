import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Redis Event Bus & Pub/Sub
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  alertStream: process.env.ALERT_STREAM || 'stream:alert:created',
  interventionStream: process.env.INTERVENTION_STREAM || 'stream:intervention:dispatched',
  consumerGroup: process.env.CONSUMER_GROUP || 'group:policy-engine',
  consumerName: process.env.CONSUMER_NAME || `policy-engine-${process.pid}`,
  policyReloadChannel: process.env.POLICY_RELOAD_CHANNEL || 'channel:policy:reload',

  // PostgreSQL Source of Truth & Audit
  postgresUrl:
    process.env.POSTGRES_URL ||
    'postgres://aedis_admin:aedis_password@localhost:5432/aedis_db',

  // Mock Gateways
  mockSmsGatewayUrl: process.env.MOCK_SMS_GATEWAY_URL || 'http://localhost:4000/v1/mock/sms',
  mockEscrowGatewayUrl: process.env.MOCK_ESCROW_GATEWAY_URL || 'http://localhost:4000/v1/mock/escrow',
};
