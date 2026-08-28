import { all } from '../db/client';
import type { ChildActor, ParentActor } from '../types';
import { listChildInstances, listParentInstances } from './chores';
import { childGoals } from './goals';
import { householdContext } from './household';
import { ledgerForChild } from './ledger';

export async function parentDashboard(db: D1Database, actor: ParentActor) {
  const [household, instances, children, activity] = await Promise.all([
    householdContext(db, actor.householdId),
    listParentInstances(db, actor),
    all<{
      id: string;
      display_name: string;
      avatar_key: string;
      accent_key: string;
      balance_minor: number;
      earned_minor: number;
      paid_minor: number;
    }>(
      db,
      `SELECT c.id, c.display_name, c.avatar_key, c.accent_key,
        COALESCE(SUM(l.amount_minor), 0) AS balance_minor,
        COALESCE(SUM(CASE WHEN l.type = 'EARNING' THEN l.amount_minor ELSE 0 END), 0) AS earned_minor,
        ABS(COALESCE(SUM(CASE WHEN l.type = 'PAYOUT' THEN l.amount_minor ELSE 0 END), 0)) AS paid_minor
       FROM children c LEFT JOIN ledger_entries l ON l.child_id = c.id
       WHERE c.household_id = ? AND c.active = 1 GROUP BY c.id ORDER BY c.display_name`,
      actor.householdId,
    ),
    all<{
      id: string;
      actor_type: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      metadata_json: string;
      created_at: string;
      actor_name: string | null;
    }>(
      db,
      `SELECT a.*, COALESCE(p.display_name, c.display_name, 'System') AS actor_name
       FROM audit_events a
       LEFT JOIN parent_users p ON p.id = a.actor_id
       LEFT JOIN children c ON c.id = a.actor_id
       WHERE a.household_id = ? ORDER BY a.created_at DESC LIMIT 20`,
      actor.householdId,
    ),
  ]);
  return {
    household,
    actor: { id: actor.id, displayName: actor.displayName, role: actor.role },
    needsReview: instances.filter((item) => item.status === 'COMPLETED_PENDING_REVIEW'),
    open: instances.filter((item) => ['SCHEDULED', 'AVAILABLE', 'CLAIMED', 'RETURNED_TO_CHILD'].includes(item.status)),
    board: instances.filter((item) => item.assignmentType === 'GENERAL' && !['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(item.status)),
    children: children.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      avatarKey: row.avatar_key,
      accentKey: row.accent_key,
      balanceMinor: row.balance_minor,
      earnedMinor: row.earned_minor,
      paidMinor: row.paid_minor,
    })),
    activity: activity.map((row) => ({
      id: row.id,
      actorType: row.actor_type,
      actorName: row.actor_name,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: JSON.parse(row.metadata_json),
      createdAt: row.created_at,
    })),
  };
}

export async function childHome(db: D1Database, actor: ChildActor) {
  const [household, chores, ledger, goals] = await Promise.all([
    householdContext(db, actor.householdId),
    listChildInstances(db, actor),
    ledgerForChild(db, actor),
    childGoals(db, actor),
  ]);
  return {
    household,
    actor: { id: actor.id, displayName: actor.displayName },
    balanceMinor: ledger.balanceMinor,
    chores,
    ledger: ledger.entries,
    goals,
  };
}
