import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { config } from './config';

// int8 (count(*), bigint) and numeric (prices) come back as JS numbers instead of strings.
types.setTypeParser(types.builtins.INT8, (v) => Number.parseInt(v, 10));
types.setTypeParser(types.builtins.NUMERIC, (v) => Number.parseFloat(v));

function buildPoolConfig(raw: string) {
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  // sslmode in the URL would override our ssl object (pg merges the URL last), so we drop it.
  url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: false },
    // Small pool: Render free plan (512 MB) + Supabase pooler connection limits.
    max: 5,
    idleTimeoutMillis: 30_000,
    // Fail with a real error instead of letting requests hang when the database is unreachable.
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  };
}

export const pool = new Pool(buildPoolConfig(config.databaseUrl));

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] idle client error', err.message);
});

/** Anything that can run a query: the pool or a client inside a transaction. */
export type Db = Pick<PoolClient, 'query'>;

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const res = await db.query<T>(sql, params);
  return res.rows[0] ?? null;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
