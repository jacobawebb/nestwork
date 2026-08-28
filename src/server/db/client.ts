import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDrizzle(db: D1Database) {
  return drizzle(db, { schema });
}

export async function first<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>();
}

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results;
}

export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result<unknown>> {
  return db.prepare(sql).bind(...params).run();
}
