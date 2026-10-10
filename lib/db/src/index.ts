import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }

    const connectionUrl = new URL(databaseUrl);
    const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(
      connectionUrl.hostname,
    );

    // pg-connection-string emits a forward-compatibility warning for
    // sslmode=require. Remote connections use an explicit strict TLS config
    // below, so remove the query option instead of relying on its semantics.
    if (!isLocalDatabase) connectionUrl.searchParams.delete("sslmode");

    _pool = new Pool({
      connectionString: connectionUrl.toString(),
      ...(isLocalDatabase
        ? {}
        : {
            ssl: { rejectUnauthorized: true },
            enableChannelBinding: true,
          }),
    });
  }

  return _pool;
}

export function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
});

export const db: ReturnType<typeof drizzle> = new Proxy(
  {} as ReturnType<typeof drizzle>,
  {
    get(_target, prop) {
      return (getDb() as any)[prop];
    },
  },
);

export * from "./schema";
