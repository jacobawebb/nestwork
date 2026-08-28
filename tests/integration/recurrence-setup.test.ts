import { describe, expect, it } from 'vitest';
import { app } from '@/server/api';
import { runScheduledMaintenance } from '@/server/services/chores';
import { bindings, createFixture } from './helpers';

describe('fresh setup and scheduled recurrence', () => {
  it('starts with schema only, creates setup atomically, and closes setup permanently', async () => {
    const env = bindings();
    for (const table of ['app_installation', 'households', 'parent_users', 'children', 'chore_templates', 'ledger_entries', 'savings_goals']) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
      expect(row?.count, table).toBe(0);
    }
    const unlock = await app.request('http://local.test/api/bootstrap/unlock', {
      method: 'POST', headers: { Origin: 'http://local.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: env.BOOTSTRAP_SECRET }),
    }, env);
    expect(unlock.status).toBe(200);
    const setupCookie = unlock.headers.get('Set-Cookie')?.split(';')[0];
    expect(setupCookie).toContain('chores_setup=');
    const complete = await app.request('http://local.test/api/bootstrap/complete', {
      method: 'POST', headers: { Origin: 'http://local.test', Cookie: setupCookie!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household: { name: 'Integration household', locale: 'en-GB', timeZone: 'Europe/London', currency: 'GBP' },
        owner: { displayName: 'Integration owner', email: 'owner@integration.test', password: 'StrongPassword123', avatarKey: 'grownup-1', accentKey: 'teal' },
        children: [], invitations: [],
        settings: { defaultApprovalMode: 'PARENT_APPROVAL', childReleaseEnabled: false, childBoardLimit: 5, savingsGoalsEnabled: true },
      }),
    }, env);
    expect(complete.status).toBe(201);
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM app_installation').first<{ count: number }>())?.count).toBe(1);
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM households').first<{ count: number }>())?.count).toBe(1);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS count FROM parent_users WHERE role = 'OWNER'`).first<{ count: number }>())?.count).toBe(1);
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM children').first<{ count: number }>())?.count).toBe(0);
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM chore_templates').first<{ count: number }>())?.count).toBe(0);
    const closed = await app.request('http://local.test/api/bootstrap/unlock', {
      method: 'POST', headers: { Origin: 'http://local.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: env.BOOTSTRAP_SECRET }),
    }, env);
    expect(closed.status).toBe(410);
  });

  it('materialises the 14-day horizon idempotently when the scheduled job repeats', async () => {
    const fixture = await createFixture('recurrence');
    const { DB } = bindings();
    const now = new Date('2026-08-28T07:30:00.000Z');
    const templateId = crypto.randomUUID();
    await DB.prepare(`INSERT INTO chore_templates (id, household_id, title, instructions, assignment_type, assigned_child_id, amount_minor, currency, approval_mode, recurrence_json, active, created_by, created_at, updated_at) VALUES (?, ?, 'Daily fixture', NULL, 'ASSIGNED', ?, 100, 'GBP', 'PARENT_APPROVAL', ?, 1, ?, ?, ?)`).bind(templateId, fixture.householdId, fixture.childAId, JSON.stringify({ kind: 'DAILY', interval: 1, startDate: '2026-08-28', availableTime: '08:00', dueTime: null, expiryTime: '20:00' }), fixture.ownerId, now.toISOString(), now.toISOString()).run();
    await runScheduledMaintenance(DB, now);
    const first = await DB.prepare('SELECT COUNT(*) AS count FROM chore_instances WHERE template_id = ?').bind(templateId).first<{ count: number }>();
    await runScheduledMaintenance(DB, now);
    const second = await DB.prepare('SELECT COUNT(*) AS count FROM chore_instances WHERE template_id = ?').bind(templateId).first<{ count: number }>();
    expect(first?.count).toBe(15);
    expect(second?.count).toBe(first?.count);
  });
});
