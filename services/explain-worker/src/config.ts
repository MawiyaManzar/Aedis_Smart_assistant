import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Redis Event Bus
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  alertStream: process.env.ALERT_STREAM || 'stream:alert:created',
  auditStream: process.env.AUDIT_STREAM || 'stream:audit:logged',
  consumerGroup: process.env.CONSUMER_GROUP || 'group:explainability',
  consumerName: process.env.CONSUMER_NAME || `explain-worker-${process.pid}`,

  // OpenRouter LLM Compliance Assistant (ADR-004)
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  temperature: 0,
  seed: 42,

  // Python ML SHAP Endpoint (TreeExplainer)
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',

  // PostgreSQL Source of Truth
  postgresUrl:
    process.env.POSTGRES_URL ||
    'postgres://aedis_admin:aedis_password@localhost:5432/aedis_db',
};
