import { env } from 'cloudflare:test';
import { app } from '@/server/api';
import { sha256 } from '@/server/security';
import type { Env } from '@/server/types';

export interface Fixture {
  householdId: string;
  ownerId: string;
  parentId: string;
  childAId: string;
  childBId: string;
  ownerCookie: string;
  parentCookie: string;
  childACookie: string;
  childBCookie: string;
}

export function bindings(): Env {
  const test = env as unknown as { DB: D1Database };
  return {
    DB: test.DB,
    ASSETS: { fetch: () => Promise.resolve(new Response('asset')) } as unknown as Fetcher,
    BOOTSTRAP_SECRET: 'integration-bootstrap-secret-with-32-characters',
    ENVIRONMENT: 'test',
    APP_VERSION: '0.1.0-test',
    APP_COMMIT: 'test',
  };
}

export async function createFixture(label: string = crypto.randomUUID()): Promise<Fixture> {
  const { DB } = bindings();
  const householdId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const parentId = crypto.randomUUID();
  const childAId = crypto.randomUUID();
  const childBId = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiry = new Date(Date.now() + 60_000).toISOString();
  const ownerToken = `owner-${label}-${crypto.randomUUID()}`;
  const parentToken = `parent-${label}-${crypto.randomUUID()}`;
  const childAToken = `child-a-${label}-${crypto.randomUUID()}`;
  const childBToken = `child-b-${label}-${crypto.randomUUID()}`;
  await DB.batch([
    DB.prepare('INSERT OR IGNORE INTO app_installation (id, setup_completed_at, created_at) VALUES (1, ?, ?)').bind(now, now),
    DB.prepare('INSERT INTO households (id, name, currency, locale, time_zone, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(householdId, `Fixture ${label}`, 'GBP', 'en-GB', 'Europe/London', now),
    DB.prepare(`INSERT INTO household_settings (household_id, default_approval_mode, child_release_enabled, child_board_limit, savings_goals_enabled, updated_at) VALUES (?, 'PARENT_APPROVAL', 1, 5, 1, ?)`).bind(householdId, now),
    DB.prepare(`INSERT INTO parent_users (id, household_id, email, display_name, avatar_key, accent_key, password_hash, role, active, last_login_at, created_at) VALUES (?, ?, ?, ?, 'grownup-1', 'teal', 'fixture-hash', 'OWNER', 1, NULL, ?)`).bind(ownerId, householdId, `owner-${label}@example.test`, `Owner ${label}`, now),
    DB.prepare(`INSERT INTO parent_users (id, household_id, email, display_name, avatar_key, accent_key, password_hash, role, active, last_login_at, created_at) VALUES (?, ?, ?, ?, 'grownup-2', 'blue', 'fixture-hash', 'PARENT', 1, NULL, ?)`).bind(parentId, householdId, `parent-${label}@example.test`, `Parent ${label}`, now),
    DB.prepare(`INSERT INTO children (id, household_id, display_name, avatar_key, accent_key, pin_hash, active, created_at, updated_at) VALUES (?, ?, ?, 'child-1', 'coral', 'fixture-hash', 1, ?, ?)`).bind(childAId, householdId, `Child A ${label}`, now, now),
    DB.prepare(`INSERT INTO children (id, household_id, display_name, avatar_key, accent_key, pin_hash, active, created_at, updated_at) VALUES (?, ?, ?, 'child-2', 'green', 'fixture-hash', 1, ?, ?)`).bind(childBId, householdId, `Child B ${label}`, now, now),
    DB.prepare('INSERT INTO child_goal_preferences (child_id, spotlight_goal_id, updated_at) VALUES (?, NULL, ?)').bind(childAId, now),
    DB.prepare('INSERT INTO child_goal_preferences (child_id, spotlight_goal_id, updated_at) VALUES (?, NULL, ?)').bind(childBId, now),
    DB.prepare(`INSERT INTO parent_sessions (token_hash, parent_user_id, last_activity_at, idle_expires_at, revoked_at, metadata) VALUES (?, ?, ?, ?, NULL, '{}')`).bind(await sha256(ownerToken), ownerId, now, expiry),
    DB.prepare(`INSERT INTO parent_sessions (token_hash, parent_user_id, last_activity_at, idle_expires_at, revoked_at, metadata) VALUES (?, ?, ?, ?, NULL, '{}')`).bind(await sha256(parentToken), parentId, now, expiry),
    DB.prepare('INSERT INTO child_sessions (token_hash, child_id, last_activity_at, idle_expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)').bind(await sha256(childAToken), childAId, now, expiry),
    DB.prepare('INSERT INTO child_sessions (token_hash, child_id, last_activity_at, idle_expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)').bind(await sha256(childBToken), childBId, now, expiry),
  ]);
  return {
    householdId, ownerId, parentId, childAId, childBId,
    ownerCookie: `chores_parent=${ownerToken}`,
    parentCookie: `chores_parent=${parentToken}`,
    childACookie: `chores_child=${childAToken}`,
    childBCookie: `chores_child=${childBToken}`,
  };
}

export async function request(path: string, options: { method?: string; cookie?: string; body?: unknown } = {}) {
  const headers = new Headers({ Origin: 'http://local.test' });
  if (options.cookie) headers.set('Cookie', options.cookie);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return app.request(`http://local.test/api${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }, bindings());
}

export async function insertTemplateAndInstance(
  fixture: Fixture,
  input: { assignmentType?: 'ASSIGNED' | 'GENERAL'; assignedChildId?: string | null; claimedChildId?: string | null; status?: string; amountMinor?: number; expiresAt?: string | null; title?: string } = {},
) {
  const { DB } = bindings();
  const templateId = crypto.randomUUID();
  const instanceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const assignmentType = input.assignmentType ?? 'ASSIGNED';
  const assignedChildId = assignmentType === 'ASSIGNED' ? (input.assignedChildId ?? fixture.childAId) : null;
  const title = input.title ?? 'Fixture chore';
  await DB.batch([
    DB.prepare(`INSERT INTO chore_templates (id, household_id, title, instructions, assignment_type, assigned_child_id, amount_minor, currency, approval_mode, recurrence_json, active, created_by, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, 'GBP', 'PARENT_APPROVAL', ?, 1, ?, ?, ?)`).bind(templateId, fixture.householdId, title, assignmentType, assignedChildId, input.amountMinor ?? 250, JSON.stringify({ kind: 'ONCE', startDate: now.slice(0, 10), availableTime: '00:00' }), fixture.ownerId, now, now),
    DB.prepare(`INSERT INTO chore_instances (id, template_id, household_id, occurrence_key, assigned_child_id, claimed_by_child_id, title_snapshot, instructions_snapshot, amount_minor_snapshot, currency_snapshot, approval_mode_snapshot, assignment_type_snapshot, status, available_at, due_at, expires_at, completed_at, reviewed_at, reviewer_id, return_reason, completion_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'GBP', 'PARENT_APPROVAL', ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, ?)`).bind(instanceId, templateId, fixture.householdId, crypto.randomUUID(), assignedChildId, input.claimedChildId ?? null, title, input.amountMinor ?? 250, assignmentType, input.status ?? 'AVAILABLE', new Date(Date.now() - 1000).toISOString(), input.expiresAt ?? null, now),
  ]);
  return { templateId, instanceId };
}
