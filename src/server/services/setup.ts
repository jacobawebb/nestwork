import type { z } from 'zod';
import type { setupSchema } from '@/lib/contracts';
import { first } from '../db/client';
import { ApiError } from '../errors';
import {
  assertNotLocked,
  attemptKey,
  clearAttempts,
  hashCredential,
  idleExpiry,
  randomToken,
  recordFailedAttempt,
  secureSecretEqual,
  sha256,
} from '../security';
import type { Env } from '../types';
import { auditStatement } from '../audit';

type SetupInput = z.infer<typeof setupSchema>;

export async function getBootstrapStatus(db: D1Database): Promise<{ initialized: boolean }> {
  const installation = await first<{ id: number }>(db, 'SELECT id FROM app_installation WHERE id = 1');
  return { initialized: Boolean(installation) };
}

export async function unlockSetup(env: Env, providedSecret: string, ip: string): Promise<string> {
  const status = await getBootstrapStatus(env.DB);
  if (status.initialized) throw new ApiError(410, 'Setup has already been completed.', 'SETUP_CLOSED');
  const key = await attemptKey('bootstrap', 'installation', ip);
  try {
    await assertNotLocked(env.DB, key);
  } catch {
    throw new ApiError(429, 'Too many attempts. Try again later.', 'RATE_LIMITED');
  }
  const valid = Boolean(env.BOOTSTRAP_SECRET) && (await secureSecretEqual(providedSecret, env.BOOTSTRAP_SECRET));
  if (!valid) {
    await recordFailedAttempt(env.DB, key);
    throw new ApiError(401, 'The setup secret was not accepted.', 'INVALID_SETUP_SECRET');
  }
  await clearAttempts(env.DB, key);
  const token = randomToken();
  const now = new Date();
  await env.DB
    .prepare('INSERT INTO setup_sessions (token_hash, ip_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)')
    .bind(await sha256(token), await sha256(ip), new Date(now.getTime() + 30 * 60_000).toISOString(), now.toISOString())
    .run();
  return token;
}

interface SetupResult {
  sessionToken: string;
  invitationLinks: Array<{ email: string; token: string }>;
  actor: { id: string; displayName: string; avatarKey: string; accentKey: string; householdId: string; role: 'OWNER'; idleExpiresAt: string };
}

export async function completeSetup(
  env: Env,
  setupToken: string,
  ip: string,
  input: SetupInput,
): Promise<SetupResult> {
  const now = new Date();
  if ((await getBootstrapStatus(env.DB)).initialized) {
    throw new ApiError(410, 'Setup has already been completed.', 'SETUP_CLOSED');
  }
  const setupHash = await sha256(setupToken);
  const session = await first<{ ip_hash: string; expires_at: string; used_at: string | null }>(
    env.DB,
    'SELECT ip_hash, expires_at, used_at FROM setup_sessions WHERE token_hash = ?',
    setupHash,
  );
  if (
    !session ||
    session.used_at ||
    session.ip_hash !== (await sha256(ip)) ||
    new Date(session.expires_at).getTime() <= now.getTime()
  ) {
    throw new ApiError(401, 'Unlock setup again to continue.', 'SETUP_SESSION_INVALID');
  }

  const householdId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  const timestamp = now.toISOString();
  const ownerPasswordHash = await hashCredential(input.owner.password);
  const childrenWithHashes = [];
  // Keep memory bounded: each scrypt call uses the configured 16 MiB profile,
  // and setup permits multiple children in a single request.
  for (const child of input.children) {
    childrenWithHashes.push({ ...child, id: crypto.randomUUID(), pinHash: await hashCredential(child.pin) });
  }
  const invitationLinks = input.invitations.map((invitation) => ({ ...invitation, id: crypto.randomUUID(), token: randomToken() }));

  const statements: D1PreparedStatement[] = [
    // This unique single-row insert is the transaction's bootstrap lock. A concurrent
    // completion fails here and D1 rolls the entire batch back.
    env.DB.prepare('INSERT INTO app_installation (id, setup_completed_at, created_at) VALUES (1, ?, ?)').bind(timestamp, timestamp),
    env.DB
      .prepare('INSERT INTO households (id, name, currency, locale, time_zone, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(
        householdId,
        input.household.name,
        input.household.currency,
        input.household.locale,
        input.household.timeZone,
        timestamp,
      ),
    env.DB
      .prepare(
        `INSERT INTO household_settings
         (household_id, default_approval_mode, child_release_enabled, child_board_limit, savings_goals_enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        householdId,
        input.settings.defaultApprovalMode,
        Number(input.settings.childReleaseEnabled),
        input.settings.childBoardLimit,
        Number(input.settings.savingsGoalsEnabled),
        timestamp,
      ),
    env.DB
      .prepare(
        `INSERT INTO parent_users
         (id, household_id, email, display_name, avatar_key, accent_key, password_hash, role, active, last_login_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'OWNER', 1, ?, ?)`,
      )
      .bind(
        ownerId,
        householdId,
        input.owner.email,
        input.owner.displayName,
        input.owner.avatarKey,
        input.owner.accentKey,
        ownerPasswordHash,
        timestamp,
        timestamp,
      ),
    env.DB
      .prepare(
        'INSERT INTO parent_sessions (token_hash, parent_user_id, last_activity_at, idle_expires_at, revoked_at, metadata) VALUES (?, ?, ?, ?, NULL, ?)',
      )
      .bind(sessionHash, ownerId, timestamp, idleExpiry(now), JSON.stringify({ setup: true })),
    env.DB.prepare('UPDATE setup_sessions SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').bind(timestamp, setupHash),
  ];

  for (const child of childrenWithHashes) {
    statements.push(
      env.DB
        .prepare(
          `INSERT INTO children
           (id, household_id, display_name, avatar_key, accent_key, pin_hash, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(child.id, householdId, child.displayName, child.avatarKey, child.accentKey, child.pinHash, timestamp, timestamp),
      env.DB
        .prepare('INSERT INTO child_goal_preferences (child_id, spotlight_goal_id, updated_at) VALUES (?, NULL, ?)')
        .bind(child.id, timestamp),
    );
  }

  for (const invitation of invitationLinks) {
    statements.push(
      env.DB
        .prepare(
          `INSERT INTO parent_invitations
           (id, household_id, email, role, token_hash, expires_at, accepted_at, invited_by, created_at)
           VALUES (?, ?, ?, 'PARENT', ?, ?, NULL, ?, ?)`,
        )
        .bind(
          invitation.id,
          householdId,
          invitation.email,
          await sha256(invitation.token),
          new Date(now.getTime() + 7 * 86_400_000).toISOString(),
          ownerId,
          timestamp,
        ),
    );
  }

  statements.push(
    auditStatement(env.DB, {
      householdId,
      actor: { type: 'OWNER', id: ownerId },
      action: 'HOUSEHOLD_SETUP_COMPLETED',
      entityType: 'HOUSEHOLD',
      entityId: householdId,
      metadata: { children: childrenWithHashes.length, invitations: invitationLinks.length },
      at: timestamp,
    }),
  );

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && /app_installation|unique|constraint/i.test(error.message)) {
      throw new ApiError(409, 'Setup was completed by another request.', 'SETUP_RACE_LOST');
    }
    throw error;
  }

  return {
    sessionToken,
    invitationLinks: invitationLinks.map(({ email, token }) => ({ email, token })),
    actor: {
      id: ownerId,
      displayName: input.owner.displayName,
      avatarKey: input.owner.avatarKey,
      accentKey: input.owner.accentKey,
      householdId,
      role: 'OWNER',
      idleExpiresAt: idleExpiry(now),
    },
  };
}
