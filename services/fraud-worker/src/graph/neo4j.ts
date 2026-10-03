import neo4j, { Driver, Session } from 'neo4j-driver';
import { config } from '../config.js';

export interface GraphFeatures {
  graphHops: number;
  fraudRingIds: string[];
  queryDurationMs: number;
}

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      config.neo4jUri,
      neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
      {
        maxConnectionPoolSize: 50,
        connectionTimeout: 2000,
      }
    );
  }
  return driver;
}

/**
 * Checks for 3-hop connections to known mule accounts or fraud rings.
 * Per ADR-002: Caps graph traversal at 3 hops with a 15ms timeout.
 */
export async function checkGraphMuleConnections(
  fromAccountId: string,
  timeoutMs: number = 15
): Promise<GraphFeatures> {
  const startTime = Date.now();
  const driverInstance = getNeo4jDriver();
  let session: Session | null = null;

  try {
    session = driverInstance.session({ defaultAccessMode: neo4j.session.READ });

    const cypher = `
      MATCH path = (a:Account {id: $fromId})-[:TRANSACTED_WITH|SHARES_DEVICE|SHARES_IP*1..3]-(b:Account)
      WHERE b.fraudRingId IS NOT NULL
      RETURN count(path) AS hops, collect(DISTINCT b.fraudRingId)[0..5] AS rings
    `;

    // Query promise wrapped with strict 15ms timeout race
    const queryPromise = session.run(cypher, { fromId: fromAccountId });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Neo4j query timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const result = await Promise.race([queryPromise, timeoutPromise]);
    const duration = Date.now() - startTime;

    if (result.records.length > 0) {
      const record = result.records[0];
      const hopsVal = record.get('hops');
      const hops = typeof hopsVal === 'object' && hopsVal?.toNumber ? hopsVal.toNumber() : Number(hopsVal) || 0;
      const rings: string[] = (record.get('rings') as string[]) || [];

      return {
        graphHops: hops,
        fraudRingIds: rings,
        queryDurationMs: duration,
      };
    }

    return {
      graphHops: 0,
      fraudRingIds: [],
      queryDurationMs: duration,
    };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    // Resilient fallback: return empty graph hops if Neo4j is unavailable or exceeds 15ms SLO
    return {
      graphHops: 0,
      fraudRingIds: [],
      queryDurationMs: duration,
    };
  } finally {
    if (session) {
      await session.close().catch(() => {});
    }
  }
}

export async function closeNeo4jDriver(): Promise<void> {
  if (driver) {
    await driver.close().catch(() => {});
    driver = null;
  }
}
