import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 4000,
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'aedis-hackathon-super-secret-jwt-key',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  streamName: process.env.RAW_STREAM || 'stream:transaction:raw',
  alertStream: process.env.ALERT_STREAM || 'stream:alert:created',
  interventionStream: process.env.INTERVENTION_STREAM || 'stream:intervention:dispatched',
  policyReloadChannel: process.env.POLICY_RELOAD_CHANNEL || 'channel:policy:reload',
  auditStream: process.env.AUDIT_STREAM || 'stream:audit:logged',
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',
};

