import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { schema } from './schema';

export type AdeDatabase = NeonHttpDatabase<typeof schema>;

interface GlobalDbCache {
  __minimalAdeDb?: AdeDatabase;
  __minimalAdeDbUrl?: string;
}

const globalCache = globalThis as unknown as GlobalDbCache;

/** Returns true when a Postgres connection string is configured. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Lazily initializes and caches the Drizzle Neon HTTP client.
 * Never wrapped in a JS Proxy; throws clearly if DATABASE_URL is absent.
 */
export function getDb(): AdeDatabase {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not configured. Check isDatabaseConfigured() or use lib/db/queries.ts for automatic local fallback.',
    );
  }

  if (globalCache.__minimalAdeDb && globalCache.__minimalAdeDbUrl === connectionString) {
    return globalCache.__minimalAdeDb;
  }

  const sql = neon(connectionString);
  const db = drizzle(sql, { schema });

  globalCache.__minimalAdeDb = db;
  globalCache.__minimalAdeDbUrl = connectionString;

  return db;
}

/** Returns the Drizzle client when DATABASE_URL is set, or null for local-store fallback. */
export function getDbOrNull(): AdeDatabase | null {
  if (!isDatabaseConfigured()) {
    return null;
  }
  return getDb();
}
