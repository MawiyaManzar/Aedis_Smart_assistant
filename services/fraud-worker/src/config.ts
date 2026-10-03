import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Redis Event Bus & Feature Store
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  rawStream: process.env.RAW_STREAM || 'stream:transaction:raw',
  alertStream: process.env.ALERT_STREAM || 'stream:alert:created',
  consumerGroup: process.env.CONSUMER_GROUP || 'group:fraud-scoring',
  consumerName: process.env.CONSUMER_NAME || `worker-${process.pid}`,

  // Neo4j Graph Database (for 3-hop mule ring detection)
  neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4jUser: process.env.NEO4J_USER || 'neo4j',
  neo4jPassword: process.env.NEO4J_PASSWORD || 'aedis_password',

  // Python ML Microservice (FastAPI + ONNX XGBoost runtime)
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',

  // PostgreSQL Source of Truth
  postgresUrl:
    process.env.POSTGRES_URL ||
    'postgres://aedis_admin:aedis_password@localhost:5432/aedis_db',

  // Risk Thresholds (per architecture spec)
  thresholds: {
    flagged: 0.3, // Score >= 0.3 triggers FLAGGED
    blocked: 0.7, // Score >= 0.7 triggers BLOCKED
  },
};
