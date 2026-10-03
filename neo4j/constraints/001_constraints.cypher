CREATE CONSTRAINT account_id_tenant_unique IF NOT EXISTS
FOR (a:Account)
REQUIRE (a.id, a.tenantId) IS UNIQUE;

CREATE CONSTRAINT device_id_unique IF NOT EXISTS
FOR (d:Device)
REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT ip_address_unique IF NOT EXISTS
FOR (i:IPAddress)
REQUIRE i.ip IS UNIQUE;

CREATE INDEX account_fraud_ring_id IF NOT EXISTS
FOR (a:Account)
ON (a.fraudRingId);
