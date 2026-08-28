import type { z } from 'zod';
import type { childInputSchema } from '@/lib/contracts';
import { auditStatement } from '../audit';
import { all, first } from '../db/client';
import { ApiError, isConstraintError } from '../errors';
import { hashCredential, randomToken, sha256 } from '../security';
import type { ParentActor } from '../types';

type ChildInput = z.infer<typeof childInputSchema>;

export async function householdContext(db: D1Database, householdId: string) {
  const household = await first<{
    id: string;
    name: string;
    currency: string;
    locale: string;
    time_zone: string;
    default_approval_mode: 'PARENT_APPROVAL' | 'AUTO_APPROVE';
    child_release_enabled: number;
    child_board_limit: number;
    savings_goals_enabled: number;
  }>(
    db,
    `SELECT h.*, s.default_approval_mode, s.child_release_enabled, s.child_board_limit, s.savings_goals_enabled
     FROM households h JOIN household_settings s ON s.household_id = h.id WHERE h.id = ?`,
    householdId,
  );
  if (!household) throw new ApiError(404, 'Household not found.', 'NOT_FOUND');
  return {
    id: household.id,
    name: household.name,
    currency: household.currency,
    locale: household.locale,
    timeZone: household.time_zone,
    settings: {
      defaultApprovalMode: household.default_approval_mode,
      childReleaseEnabled: Boolean(household.child_release_enabled),
      childBoardLimit: household.child_board_limit,
      savingsGoalsEnabled: Boolean(household.savings_goals_enabled),
    },
  };
}

export async function listPeople(db: D1Database, actor: ParentActor) {
  const [parents, children, invitations] = await Promise.all([
    all<{
      id: string;
      display_name: string;
      email: string;
      role: 'OWNER' | 'PARENT';
      avatar_key: string;
      accent_key: string;
      active: number;
    }>(
      db,
      'SELECT id, display_name, email, role, avatar_key, accent_key, active FROM parent_users WHERE household_id = ? ORDER BY role DESC, display_name',
      actor.householdId,
    ),
    all<{
      id: string;
      display_name: string;
      avatar_key: string;
      accent_key: string;
      active: number;
    }>(
      db,
      'SELECT id, display_name, avatar_key, accent_key, active FROM children WHERE household_id = ? ORDER BY active DESC, display_name',
      actor.householdId,
    ),
    actor.role === 'OWNER'
      ? all<{ id: string; email: string; expires_at: string; accepted_at: string | null }>(
          db,
          'SELECT id, email, expires_at, accepted_at FROM parent_invitations WHERE household_id = ? ORDER BY created_at DESC',
          actor.householdId,
        )
      : Promise.resolve([]),
  ]);
  return {
    parents: parents.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      role: row.role,
      avatarKey: row.avatar_key,
      accentKey: row.accent_key,
      active: Boolean(row.active),
    })),
    children: children.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      avatarKey: row.avatar_key,
      accentKey: row.accent_key,
      active: Boolean(row.active),
    })),
    invitations: invitations.map((row) => ({
      id: row.id,
      email: row.email,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
    })),
  };
}

export async function createChild(db: D1Database, actor: ParentActor, input: ChildInput & { pin: string }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const pinHash = await hashCredential(input.pin);
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO children
           (id, household_id, display_name, avatar_key, accent_key, pin_hash, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(id, actor.householdId, input.displayName, input.avatarKey, input.accentKey, pinHash, now, now),
      db.prepare('INSERT INTO child_goal_preferences (child_id, spotlight_goal_id, updated_at) VALUES (?, NULL, ?)').bind(id, now),
      auditStatement(db, {
        householdId: actor.householdId,
        actor,
        action: 'CHILD_CREATED',
        entityType: 'CHILD',
        entityId: id,
        at: now,
      }),
    ]);
  } catch (error) {
    if (isConstraintError(error)) throw new ApiError(409, 'Use a unique active child name.', 'DUPLICATE_CHILD');
    throw error;
  }
  return { id };
}

export async function updateChild(
  db: D1Database,
  actor: ParentActor,
  childId: string,
  input: Partial<ChildInput> & { pin?: string },
) {
  const child = await first<{ id: string }>(db, 'SELECT id FROM children WHERE id = ? AND household_id = ?', childId, actor.householdId);
  if (!child) throw new ApiError(404, 'Child not found.', 'NOT_FOUND');
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const [column, value] of [
    ['display_name', input.displayName],
    ['avatar_key', input.avatarKey],
    ['accent_key', input.accentKey],
  ] as const) {
    if (value !== undefined) {
      updates.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (input.pin) {
    updates.push('pin_hash = ?');
    params.push(await hashCredential(input.pin));
  }
  if (!updates.length) return { id: childId };
  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  params.push(now, childId, actor.householdId);
  const statements = [
    db.prepare(`UPDATE children SET ${updates.join(', ')} WHERE id = ? AND household_id = ?`).bind(...params),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: input.pin ? 'CHILD_PIN_RESET' : 'CHILD_UPDATED',
      entityType: 'CHILD',
      entityId: childId,
      at: now,
    }),
  ];
  if (input.pin) {
    statements.splice(1, 0, db.prepare('UPDATE child_sessions SET revoked_at = ? WHERE child_id = ? AND revoked_at IS NULL').bind(now, childId));
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (isConstraintError(error)) throw new ApiError(409, 'Use a unique active child name.', 'DUPLICATE_CHILD');
    throw error;
  }
  return { id: childId };
}

export async function setChildActive(db: D1Database, actor: ParentActor, childId: string, active: boolean) {
  const now = new Date().toISOString();
  const result = await db.batch([
    db
      .prepare('UPDATE children SET active = ?, updated_at = ? WHERE id = ? AND household_id = ?')
      .bind(Number(active), now, childId, actor.householdId),
    db.prepare('UPDATE child_sessions SET revoked_at = ? WHERE child_id = ? AND revoked_at IS NULL').bind(now, childId),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: active ? 'CHILD_REACTIVATED' : 'CHILD_ARCHIVED',
      entityType: 'CHILD',
      entityId: childId,
      at: now,
    }),
  ]);
  if (!result[0]?.meta.changes) throw new ApiError(404, 'Child not found.', 'NOT_FOUND');
  return { id: childId, active };
}

export async function updateSettings(
  db: D1Database,
  actor: ParentActor,
  input: {
    name: string;
    locale: string;
    timeZone: string;
    currency: string;
    defaultApprovalMode: 'PARENT_APPROVAL' | 'AUTO_APPROVE';
    childReleaseEnabled: boolean;
    childBoardLimit: number;
    savingsGoalsEnabled: boolean;
    confirmTimeZoneChange?: boolean;
  },
) {
  if (actor.role !== 'OWNER') throw new ApiError(403, 'Only the owner can change household settings.', 'OWNER_REQUIRED');
  const current = await householdContext(db, actor.householdId);
  if (current.timeZone !== input.timeZone && !input.confirmTimeZoneChange) {
    throw new ApiError(409, 'Confirm the time-zone change. Historical timestamps will not move.', 'TIME_ZONE_CONFIRMATION');
  }
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare('UPDATE households SET name = ?, locale = ?, time_zone = ?, currency = ? WHERE id = ?')
      .bind(input.name, input.locale, input.timeZone, input.currency, actor.householdId),
    db
      .prepare(
        `UPDATE household_settings SET default_approval_mode = ?, child_release_enabled = ?, child_board_limit = ?,
         savings_goals_enabled = ?, updated_at = ? WHERE household_id = ?`,
      )
      .bind(
        input.defaultApprovalMode,
        Number(input.childReleaseEnabled),
        input.childBoardLimit,
        Number(input.savingsGoalsEnabled),
        now,
        actor.householdId,
      ),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'HOUSEHOLD_SETTINGS_UPDATED',
      entityType: 'HOUSEHOLD',
      entityId: actor.householdId,
      metadata: { timeZoneChanged: current.timeZone !== input.timeZone },
      at: now,
    }),
  ]);
  return householdContext(db, actor.householdId);
}

export async function createInvitation(db: D1Database, actor: ParentActor, email: string) {
  if (actor.role !== 'OWNER') throw new ApiError(403, 'Only the owner can invite adults.', 'OWNER_REQUIRED');
  const existing = await first<{ id: string }>(
    db,
    'SELECT id FROM parent_users WHERE household_id = ? AND email = ? COLLATE NOCASE',
    actor.householdId,
    email,
  );
  if (existing) throw new ApiError(409, 'That adult already belongs to this household.', 'ALREADY_MEMBER');
  const id = crypto.randomUUID();
  const token = randomToken();
  const now = new Date();
  await db.batch([
    db
      .prepare(
        `INSERT INTO parent_invitations
         (id, household_id, email, role, token_hash, expires_at, accepted_at, invited_by, created_at)
         VALUES (?, ?, ?, 'PARENT', ?, ?, NULL, ?, ?)`,
      )
      .bind(id, actor.householdId, email, await sha256(token), new Date(now.getTime() + 7 * 86_400_000).toISOString(), actor.id, now.toISOString()),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'PARENT_INVITED',
      entityType: 'PARENT_INVITATION',
      entityId: id,
      metadata: { email },
      at: now.toISOString(),
    }),
  ]);
  return { id, email, token, expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString() };
}

export async function invitationDetails(db: D1Database, token: string) {
  const invitation = await first<{
    id: string;
    email: string;
    household_name: string;
    expires_at: string;
    accepted_at: string | null;
  }>(
    db,
    `SELECT i.id, i.email, h.name AS household_name, i.expires_at, i.accepted_at
     FROM parent_invitations i JOIN households h ON h.id = i.household_id WHERE i.token_hash = ?`,
    await sha256(token),
  );
  if (!invitation || invitation.accepted_at || new Date(invitation.expires_at).getTime() <= Date.now()) {
    throw new ApiError(410, 'This invitation is invalid, expired, or already used.', 'INVITATION_INVALID');
  }
  return { id: invitation.id, email: invitation.email, householdName: invitation.household_name, expiresAt: invitation.expires_at };
}

export async function acceptInvitation(db: D1Database, token: string, displayName: string, password: string) {
  const details = await invitationDetails(db, token);
  const tokenHash = await sha256(token);
  const invitation = await first<{ household_id: string }>(db, 'SELECT household_id FROM parent_invitations WHERE token_hash = ?', tokenHash);
  if (!invitation) throw new ApiError(410, 'This invitation is invalid.', 'INVITATION_INVALID');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hashCredential(password);
  try {
    const results = await db.batch([
      db
        .prepare(
          `UPDATE parent_invitations SET accepted_at = ?
           WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?`,
        )
        .bind(now, tokenHash, now),
      db
        .prepare(
          `INSERT INTO parent_users
           (id, household_id, email, display_name, avatar_key, accent_key, password_hash, role, active, last_login_at, created_at)
           SELECT ?, household_id, email, ?, 'grownup-2', 'blue', ?, 'PARENT', 1, NULL, ?
           FROM parent_invitations WHERE token_hash = ? AND accepted_at = ?`,
        )
        .bind(id, displayName, passwordHash, now, tokenHash, now),
      auditStatement(db, {
        householdId: invitation.household_id,
        actor: { type: 'PARENT', id },
        action: 'PARENT_INVITATION_ACCEPTED',
        entityType: 'PARENT_USER',
        entityId: id,
        at: now,
      }),
    ]);
    if (!results[0]?.meta.changes || !results[1]?.meta.changes) throw new Error('invitation already used');
  } catch (error) {
    if (isConstraintError(error) || (error instanceof Error && /invitation already used/i.test(error.message))) {
      throw new ApiError(410, 'This invitation is invalid, expired, or already used.', 'INVITATION_INVALID');
    }
    throw error;
  }
  return { id, email: details.email, householdName: details.householdName };
}

export async function setParentActive(db: D1Database, actor: ParentActor, parentId: string, active: boolean) {
  if (actor.role !== 'OWNER') throw new ApiError(403, 'Only the owner can manage adult accounts.', 'OWNER_REQUIRED');
  const target = await first<{ role: 'OWNER' | 'PARENT' }>(
    db,
    'SELECT role FROM parent_users WHERE id = ? AND household_id = ?',
    parentId,
    actor.householdId,
  );
  if (!target) throw new ApiError(404, 'Adult account not found.', 'NOT_FOUND');
  if (target.role === 'OWNER') throw new ApiError(409, 'The sole owner cannot be deactivated.', 'OWNER_PROTECTED');
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE parent_users SET active = ? WHERE id = ? AND household_id = ?').bind(Number(active), parentId, actor.householdId),
    db.prepare('UPDATE parent_sessions SET revoked_at = ? WHERE parent_user_id = ? AND revoked_at IS NULL').bind(now, parentId),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: active ? 'PARENT_REACTIVATED' : 'PARENT_DEACTIVATED',
      entityType: 'PARENT_USER',
      entityId: parentId,
      at: now,
    }),
  ]);
  return { id: parentId, active };
}
