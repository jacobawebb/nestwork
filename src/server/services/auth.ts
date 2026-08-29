import { auditStatement } from '../audit';
import { first, run } from '../db/client';
import { ApiError } from '../errors';
import {
  assertNotLocked,
  attemptKey,
  clearAttempts,
  idleExpiry,
  randomToken,
  recordFailedAttempt,
  sha256,
  verifyCredential,
} from '../security';
import type { Actor, ChildActor, ParentActor } from '../types';

interface ParentRow {
  id: string;
  household_id: string;
  display_name: string;
  role: 'OWNER' | 'PARENT';
  email: string;
  password_hash: string;
}

interface ChildRow {
  id: string;
  household_id: string;
  display_name: string;
  pin_hash: string;
}

// A fixed, non-secret scrypt verifier keeps unknown/deactivated profile paths
// on the same slow-hash code path as real accounts without doing two hashes.
const DUMMY_CREDENTIAL_HASH = 'scrypt$16384$8$5$ZmFtaWx5LWNob3Jlcy1kdW1teS1sb2dpbi1zYWx0$PZLInIa3alIDDSo8psm/hG+JcWAzZeiZFqVNtW4e+TU=';

export async function listProfiles(db: D1Database): Promise<{
  initialized: boolean;
  householdName?: string;
  profiles: Array<{ id: string; type: 'PARENT' | 'CHILD'; displayName: string; avatarKey: string; accentKey: string; label: string }>;
}> {
  const household = await first<{ id: string; name: string }>(
    db,
    'SELECT h.id, h.name FROM households h JOIN app_installation i ON i.id = 1 LIMIT 1',
  );
  if (!household) return { initialized: false, profiles: [] };
  const result = await db
    .prepare(
      `SELECT id, 'PARENT' AS type, display_name, avatar_key, accent_key, role AS label
       FROM parent_users WHERE household_id = ? AND active = 1
       UNION ALL
       SELECT id, 'CHILD' AS type, display_name, avatar_key, accent_key, 'CHILD' AS label
       FROM children WHERE household_id = ? AND active = 1
       ORDER BY type DESC, display_name COLLATE NOCASE`,
    )
    .bind(household.id, household.id)
    .all<{
      id: string;
      type: 'PARENT' | 'CHILD';
      display_name: string;
      avatar_key: string;
      accent_key: string;
      label: string;
    }>();
  return {
    initialized: true,
    householdName: household.name,
    profiles: result.results.map((row) => ({
      id: row.id,
      type: row.type,
      displayName: row.display_name,
      avatarKey: row.avatar_key,
      accentKey: row.accent_key,
      label: row.label === 'CHILD' ? 'Child' : 'Adult',
    })),
  };
}

export async function loginParent(
  db: D1Database,
  input: { profileId: string; email: string; password: string },
  ip: string,
): Promise<{ token: string; actor: Omit<ParentActor, 'sessionHash'> }> {
  const key = await attemptKey('parent-login', input.profileId, ip);
  try {
    await assertNotLocked(db, key);
  } catch {
    throw new ApiError(429, 'Too many attempts. Try again in 15 minutes.', 'RATE_LIMITED');
  }
  const parent = await first<ParentRow>(
    db,
    `SELECT id, household_id, display_name, role, email, password_hash
     FROM parent_users WHERE id = ? AND active = 1`,
    input.profileId,
  );
  const passwordValid = await verifyCredential(input.password, parent?.password_hash ?? DUMMY_CREDENTIAL_HASH);
  const emailValid = parent?.email.toLowerCase() === input.email.trim().toLowerCase();
  const valid = Boolean(parent && emailValid && passwordValid);
  if (!parent || !valid) {
    await recordFailedAttempt(db, key);
    throw new ApiError(401, 'The sign-in details were not accepted.', 'INVALID_CREDENTIALS');
  }
  await clearAttempts(db, key);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiry = idleExpiry(now);
  await db.batch([
    db
      .prepare(
        'INSERT INTO parent_sessions (token_hash, parent_user_id, last_activity_at, idle_expires_at, revoked_at, metadata) VALUES (?, ?, ?, ?, NULL, ?)',
      )
      .bind(tokenHash, parent.id, now.toISOString(), expiry, '{}'),
    db.prepare('UPDATE parent_users SET last_login_at = ? WHERE id = ?').bind(now.toISOString(), parent.id),
    auditStatement(db, {
      householdId: parent.household_id,
      actor: { type: parent.role, id: parent.id },
      action: 'PARENT_LOGIN',
      entityType: 'PARENT_USER',
      entityId: parent.id,
      at: now.toISOString(),
    }),
  ]);
  return {
    token,
    actor: {
      type: parent.role,
      id: parent.id,
      householdId: parent.household_id,
      displayName: parent.display_name,
      role: parent.role,
      idleExpiresAt: expiry,
    },
  };
}

export async function loginChild(
  db: D1Database,
  input: { profileId: string; pin: string },
  ip: string,
): Promise<{ token: string; actor: Omit<ChildActor, 'sessionHash'> }> {
  const key = await attemptKey('child-login', input.profileId, ip);
  try {
    await assertNotLocked(db, key);
  } catch {
    throw new ApiError(429, 'Too many attempts. Try again in 15 minutes.', 'RATE_LIMITED');
  }
  const child = await first<ChildRow>(
    db,
    'SELECT id, household_id, display_name, pin_hash FROM children WHERE id = ? AND active = 1',
    input.profileId,
  );
  const valid = await verifyCredential(input.pin, child?.pin_hash ?? DUMMY_CREDENTIAL_HASH);
  if (!child || !valid) {
    await recordFailedAttempt(db, key);
    throw new ApiError(401, 'The PIN was not accepted.', 'INVALID_CREDENTIALS');
  }
  await clearAttempts(db, key);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiry = idleExpiry(now);
  await db
    .prepare('INSERT INTO child_sessions (token_hash, child_id, last_activity_at, idle_expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)')
    .bind(tokenHash, child.id, now.toISOString(), expiry)
    .run();
  return {
    token,
    actor: {
      type: 'CHILD',
      id: child.id,
      householdId: child.household_id,
      displayName: child.display_name,
      idleExpiresAt: expiry,
    },
  };
}

export async function resolveParentSession(db: D1Database, token: string, touch: boolean): Promise<ParentActor | null> {
  const tokenHash = await sha256(token);
  const now = new Date();
  const row = await first<{
    id: string;
    household_id: string;
    display_name: string;
    role: 'OWNER' | 'PARENT';
    idle_expires_at: string;
  }>(
    db,
    `SELECT p.id, p.household_id, p.display_name, p.role, s.idle_expires_at
     FROM parent_sessions s JOIN parent_users p ON p.id = s.parent_user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.idle_expires_at > ? AND p.active = 1`,
    tokenHash,
    now.toISOString(),
  );
  if (!row) return null;
  let expiresAt = row.idle_expires_at;
  if (touch) {
    expiresAt = idleExpiry(now);
    const result = await run(
      db,
      `UPDATE parent_sessions SET last_activity_at = ?, idle_expires_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL AND idle_expires_at > ?`,
      now.toISOString(),
      expiresAt,
      tokenHash,
      now.toISOString(),
    );
    if (!result.meta.changes) return null;
  }
  return {
    type: row.role,
    id: row.id,
    householdId: row.household_id,
    displayName: row.display_name,
    role: row.role,
    sessionHash: tokenHash,
    idleExpiresAt: expiresAt,
  };
}

export async function resolveChildSession(db: D1Database, token: string, touch: boolean): Promise<ChildActor | null> {
  const tokenHash = await sha256(token);
  const now = new Date();
  const row = await first<{ id: string; household_id: string; display_name: string; idle_expires_at: string }>(
    db,
    `SELECT c.id, c.household_id, c.display_name, s.idle_expires_at
     FROM child_sessions s JOIN children c ON c.id = s.child_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.idle_expires_at > ? AND c.active = 1`,
    tokenHash,
    now.toISOString(),
  );
  if (!row) return null;
  let expiresAt = row.idle_expires_at;
  if (touch) {
    expiresAt = idleExpiry(now);
    const result = await run(
      db,
      `UPDATE child_sessions SET last_activity_at = ?, idle_expires_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL AND idle_expires_at > ?`,
      now.toISOString(),
      expiresAt,
      tokenHash,
      now.toISOString(),
    );
    if (!result.meta.changes) return null;
  }
  return {
    type: 'CHILD',
    id: row.id,
    householdId: row.household_id,
    displayName: row.display_name,
    sessionHash: tokenHash,
    idleExpiresAt: expiresAt,
  };
}

export async function revokeSession(db: D1Database, actor: Actor): Promise<void> {
  const table = actor.type === 'CHILD' ? 'child_sessions' : 'parent_sessions';
  await run(db, `UPDATE ${table} SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`, new Date().toISOString(), actor.sessionHash);
}
