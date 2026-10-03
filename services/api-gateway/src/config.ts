import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 4000,
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'aedis-hackathon-super-secret-jwt-key',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  streamName: process.env.RAW_STREAM || 'stream:transaction:raw',
  alertStream: process.env.ALERT_STREAM || 'stream:alert:created',
};

