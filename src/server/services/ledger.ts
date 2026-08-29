import type { z } from 'zod';
import type { ledgerMutationSchema } from '@/lib/contracts';
import { guardedAuditStatement } from '../audit';
import { all, first } from '../db/client';
import { validateLedgerMutation } from '../domain/policies';
import { ApiError } from '../errors';
import type { ChildActor, ParentActor } from '../types';
import { householdContext } from './household';

type LedgerMutation = z.infer<typeof ledgerMutationSchema>;

export async function childBalance(db: D1Database, householdId: string, childId: string): Promise<number> {
  const row = await first<{ balance: number }>(
    db,
    'SELECT COALESCE(SUM(amount_minor), 0) AS balance FROM ledger_entries WHERE household_id = ? AND child_id = ?',
    householdId,
    childId,
  );
  return row?.balance ?? 0;
}

export async function ledgerForParent(db: D1Database, actor: ParentActor, childId?: string) {
  if (childId) {
    const child = await first<{ id: string }>(db, 'SELECT id FROM children WHERE id = ? AND household_id = ?', childId, actor.householdId);
    if (!child) throw new ApiError(404, 'Child not found.', 'NOT_FOUND');
  }
  const rows = await all<{
    id: string;
    child_id: string;
    child_name: string;
    chore_instance_id: string | null;
    type: 'EARNING' | 'PAYOUT' | 'ADJUSTMENT' | 'REVERSAL';
    amount_minor: number;
    currency: string;
    reason: string;
    created_at: string;
  }>(
    db,
    `SELECT l.*, c.display_name AS child_name FROM ledger_entries l
     JOIN children c ON c.id = l.child_id
     WHERE l.household_id = ? AND (? IS NULL OR l.child_id = ?)
     ORDER BY l.created_at DESC LIMIT 300`,
    actor.householdId,
    childId ?? null,
    childId ?? null,
  );
  return rows.map(mapLedger);
}

export async function ledgerForChild(db: D1Database, actor: ChildActor) {
  const rows = await all<{
    id: string;
    child_id: string;
    child_name: string;
    chore_instance_id: string | null;
    type: 'EARNING' | 'PAYOUT' | 'ADJUSTMENT' | 'REVERSAL';
    amount_minor: number;
    currency: string;
    reason: string;
    created_at: string;
  }>(
    db,
    `SELECT l.*, c.display_name AS child_name FROM ledger_entries l
     JOIN children c ON c.id = l.child_id
     WHERE l.household_id = ? AND l.child_id = ? ORDER BY l.created_at DESC LIMIT 100`,
    actor.householdId,
    actor.id,
  );
  return { balanceMinor: await childBalance(db, actor.householdId, actor.id), entries: rows.map(mapLedger) };
}

export async function createLedgerMutation(db: D1Database, actor: ParentActor, input: LedgerMutation) {
  const child = await first<{ id: string }>(
    db,
    'SELECT id FROM children WHERE id = ? AND household_id = ? AND active = 1',
    input.childId,
    actor.householdId,
  );
  if (!child) throw new ApiError(404, 'Child not found.', 'NOT_FOUND');
  const balance = await childBalance(db, actor.householdId, input.childId);
  const validation = validateLedgerMutation(input.type, input.amountMinor, balance, input.confirmNegative);
  if (!validation.ok) throw new ApiError(409, validation.reason, 'LEDGER_GUARD');
  const context = await householdContext(db, actor.householdId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO ledger_entries
         (id, household_id, child_id, chore_instance_id, type, amount_minor, currency, reason, created_by_parent_id, created_at)
         SELECT ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?
         WHERE ? >= 0 OR ? = 1 OR
           COALESCE((SELECT SUM(amount_minor) FROM ledger_entries WHERE household_id = ? AND child_id = ?), 0) + ? >= 0`,
      )
      .bind(
        id,
        actor.householdId,
        input.childId,
        input.type,
        validation.signedAmount,
        context.currency,
        input.reason,
        actor.id,
        now,
        validation.signedAmount,
        Number(input.confirmNegative),
        actor.householdId,
        input.childId,
        validation.signedAmount,
      ),
    guardedAuditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: `LEDGER_${input.type}_CREATED`,
      entityType: 'LEDGER_ENTRY',
      entityId: id,
      metadata: { amountMinor: validation.signedAmount, childId: input.childId, reason: input.reason },
      at: now,
    }),
  ]);
  if (!results[0]?.meta.changes) throw new ApiError(409, 'The available balance changed. Refresh before recording this entry.', 'LEDGER_GUARD');
  return { id, balanceMinor: await childBalance(db, actor.householdId, input.childId) };
}

function mapLedger(row: {
  id: string;
  child_id: string;
  child_name: string;
  chore_instance_id: string | null;
  type: 'EARNING' | 'PAYOUT' | 'ADJUSTMENT' | 'REVERSAL';
  amount_minor: number;
  currency: string;
  reason: string;
  created_at: string;
}) {
  return {
    id: row.id,
    childId: row.child_id,
    childName: row.child_name,
    choreInstanceId: row.chore_instance_id,
    type: row.type,
    amountMinor: row.amount_minor,
    currency: row.currency,
    reason: row.reason,
    createdAt: row.created_at,
  };
}
