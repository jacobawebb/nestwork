import type { z } from 'zod';
import type { goalInputSchema } from '@/lib/contracts';
import { auditStatement } from '../audit';
import { all, first } from '../db/client';
import { ApiError } from '../errors';
import type { ChildActor, ParentActor } from '../types';
import { childBalance } from './ledger';

type GoalInput = z.infer<typeof goalInputSchema>;

interface GoalRow {
  id: string;
  child_id: string;
  name: string;
  target_minor: number;
  icon_key: string;
  encouragement: string | null;
  display_order: number;
  active: number;
  spotlight: number;
}

export async function goalsForChild(db: D1Database, householdId: string, childId: string) {
  const child = await first<{ id: string }>(db, 'SELECT id FROM children WHERE id = ? AND household_id = ?', childId, householdId);
  if (!child) throw new ApiError(404, 'Child not found.', 'NOT_FOUND');
  const [rows, balance] = await Promise.all([
    all<GoalRow>(
      db,
      `SELECT g.*, CASE WHEN p.spotlight_goal_id = g.id THEN 1 ELSE 0 END AS spotlight
       FROM savings_goals g LEFT JOIN child_goal_preferences p ON p.child_id = g.child_id
       WHERE g.child_id = ? ORDER BY g.active DESC, g.display_order, g.created_at`,
      childId,
    ),
    childBalance(db, householdId, childId),
  ]);
  return rows.map((row) => ({
    id: row.id,
    childId: row.child_id,
    name: row.name,
    targetMinor: row.target_minor,
    iconKey: row.icon_key,
    encouragement: row.encouragement,
    displayOrder: row.display_order,
    active: Boolean(row.active),
    spotlight: Boolean(row.spotlight),
    progressMinor: Math.min(Math.max(balance, 0), row.target_minor),
    progressPercent: Math.min(100, Math.max(0, Math.round((balance / row.target_minor) * 100))),
    reached: balance >= row.target_minor,
  }));
}

export async function createGoal(db: D1Database, actor: ParentActor, input: GoalInput) {
  const child = await first<{ id: string }>(
    db,
    'SELECT id FROM children WHERE id = ? AND household_id = ?',
    input.childId,
    actor.householdId,
  );
  if (!child) throw new ApiError(404, 'Child not found.', 'NOT_FOUND');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO savings_goals
         (id, child_id, name, target_minor, icon_key, encouragement, display_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(id, input.childId, input.name, input.targetMinor, input.iconKey, input.encouragement ?? null, input.displayOrder, now, now),
    db
      .prepare(
        `UPDATE child_goal_preferences SET spotlight_goal_id = COALESCE(spotlight_goal_id, ?), updated_at = ?
         WHERE child_id = ?`,
      )
      .bind(id, now, input.childId),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'SAVINGS_GOAL_CREATED',
      entityType: 'SAVINGS_GOAL',
      entityId: id,
      metadata: { childId: input.childId, targetMinor: input.targetMinor },
      at: now,
    }),
  ]);
  return { id };
}

export async function updateGoal(db: D1Database, actor: ParentActor, goalId: string, input: Partial<GoalInput> & { active?: boolean }) {
  const goal = await first<{ child_id: string }>(
    db,
    `SELECT g.child_id FROM savings_goals g JOIN children c ON c.id = g.child_id
     WHERE g.id = ? AND c.household_id = ?`,
    goalId,
    actor.householdId,
  );
  if (!goal) throw new ApiError(404, 'Goal not found.', 'NOT_FOUND');
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const [column, value] of [
    ['name', input.name],
    ['target_minor', input.targetMinor],
    ['icon_key', input.iconKey],
    ['encouragement', input.encouragement],
    ['display_order', input.displayOrder],
    ['active', input.active === undefined ? undefined : Number(input.active)],
  ] as const) {
    if (value !== undefined) {
      updates.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (!updates.length) return { id: goalId };
  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  params.push(now, goalId);
  const statements = [
    db.prepare(`UPDATE savings_goals SET ${updates.join(', ')} WHERE id = ?`).bind(...params),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: input.active === false ? 'SAVINGS_GOAL_ARCHIVED' : 'SAVINGS_GOAL_UPDATED',
      entityType: 'SAVINGS_GOAL',
      entityId: goalId,
      at: now,
    }),
  ];
  if (input.active === false) {
    statements.splice(
      1,
      0,
      db
        .prepare('UPDATE child_goal_preferences SET spotlight_goal_id = NULL, updated_at = ? WHERE child_id = ? AND spotlight_goal_id = ?')
        .bind(now, goal.child_id, goalId),
    );
  }
  await db.batch(statements);
  return { id: goalId };
}

export async function selectSpotlightGoal(db: D1Database, actor: ChildActor, goalId: string | null) {
  if (goalId) {
    const goal = await first<{ id: string }>(
      db,
      'SELECT id FROM savings_goals WHERE id = ? AND child_id = ? AND active = 1',
      goalId,
      actor.id,
    );
    if (!goal) throw new ApiError(404, 'Active goal not found.', 'NOT_FOUND');
  }
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare('UPDATE child_goal_preferences SET spotlight_goal_id = ?, updated_at = ? WHERE child_id = ?')
      .bind(goalId, now, actor.id),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'SPOTLIGHT_GOAL_SELECTED',
      entityType: 'SAVINGS_GOAL',
      entityId: goalId,
      at: now,
    }),
  ]);
  return { spotlightGoalId: goalId };
}

export async function parentGoals(db: D1Database, actor: ParentActor, childId: string) {
  return goalsForChild(db, actor.householdId, childId);
}

export async function childGoals(db: D1Database, actor: ChildActor) {
  return goalsForChild(db, actor.householdId, actor.id);
}
