import type { Actor } from './types';

export function auditStatement(
  db: D1Database,
  event: {
    householdId: string;
    actor: Pick<Actor, 'type' | 'id'> | { type: 'SYSTEM'; id?: null };
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    at?: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_events
       (id, household_id, actor_type, actor_id, action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      event.householdId,
      event.actor.type,
      event.actor.id ?? null,
      event.action,
      event.entityType,
      event.entityId ?? null,
      JSON.stringify(event.metadata ?? {}),
      event.at ?? new Date().toISOString(),
    );
}

/**
 * Records an event only when the immediately preceding statement on the same
 * D1 batch connection changed a row. Keep this directly after the guarded
 * UPDATE/DELETE. It prevents a losing concurrent claim or review from leaving
 * an audit event for a transition that did not happen.
 */
export function guardedAuditStatement(
  db: D1Database,
  event: {
    householdId: string;
    actor: Pick<Actor, 'type' | 'id'> | { type: 'SYSTEM'; id?: null };
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    at?: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_events
       (id, household_id, actor_type, actor_id, action, entity_type, entity_id, metadata_json, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`,
    )
    .bind(
      crypto.randomUUID(),
      event.householdId,
      event.actor.type,
      event.actor.id ?? null,
      event.action,
      event.entityType,
      event.entityId ?? null,
      JSON.stringify(event.metadata ?? {}),
      event.at ?? new Date().toISOString(),
    );
}
