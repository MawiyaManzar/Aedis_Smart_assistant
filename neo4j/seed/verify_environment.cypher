MERGE (a:Account {id: 'acct-verify-001', tenantId: 'tenant-verify'})
SET a.purpose = 'environment-verification';

MERGE (b:Account {id: 'acct-verify-002', tenantId: 'tenant-verify'})
SET b.purpose = 'environment-verification';

MERGE (d:Device {id: 'device-verify-001'});

MERGE (ip:IPAddress {ip: '203.0.113.10'});

MERGE (a)-[:TRANSACTED_WITH {verification: true}]->(b);
MERGE (a)-[:SHARES_DEVICE]->(d);
MERGE (b)-[:SHARES_DEVICE]->(d);
MERGE (a)-[:SHARES_IP]->(ip);
MERGE (b)-[:SHARES_IP]->(ip);
