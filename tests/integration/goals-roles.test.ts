import { describe, expect, it } from 'vitest';
import { bindings, createFixture, request } from './helpers';

describe('owner roles and child goal ownership', () => {
  it('denies household and adult management to PARENT while allowing OWNER', async () => {
    const fixture = await createFixture('roles');
    const settings = { name: 'Updated fixture', locale: 'en-GB', timeZone: 'Europe/London', currency: 'GBP', defaultApprovalMode: 'PARENT_APPROVAL', childReleaseEnabled: true, childBoardLimit: 5, savingsGoalsEnabled: true };
    expect((await request('/parent/settings', { cookie: fixture.parentCookie, method: 'PUT', body: settings })).status).toBe(403);
    expect((await request('/parent/invitations', { cookie: fixture.parentCookie, body: { email: 'new-parent@example.test' } })).status).toBe(403);
    expect((await request(`/parent/adults/${fixture.parentId}/active`, { cookie: fixture.parentCookie, body: { active: false } })).status).toBe(403);
    expect((await request('/parent/settings', { cookie: fixture.ownerCookie, method: 'PUT', body: settings })).status).toBe(200);
    expect((await request('/parent/invitations', { cookie: fixture.ownerCookie, body: { email: 'new-parent@example.test' } })).status).toBe(201);
  });

  it('shows multiple goals against the same balance and only allows an owned active spotlight', async () => {
    const fixture = await createFixture('goals');
    const { DB } = bindings();
    const now = new Date().toISOString();
    const goalA = crypto.randomUUID();
    const goalB = crypto.randomUUID();
    const otherGoal = crypto.randomUUID();
    await DB.batch([
      DB.prepare(`INSERT INTO ledger_entries (id, household_id, child_id, chore_instance_id, type, amount_minor, currency, reason, created_by_parent_id, created_at) VALUES (?, ?, ?, NULL, 'ADJUSTMENT', 700, 'GBP', 'fixture balance', ?, ?)`).bind(crypto.randomUUID(), fixture.householdId, fixture.childAId, fixture.ownerId, now),
      DB.prepare(`INSERT INTO savings_goals (id, child_id, name, target_minor, icon_key, encouragement, display_order, active, created_at, updated_at) VALUES (?, ?, 'Small goal', 500, 'target', NULL, 0, 1, ?, ?)`).bind(goalA, fixture.childAId, now, now),
      DB.prepare(`INSERT INTO savings_goals (id, child_id, name, target_minor, icon_key, encouragement, display_order, active, created_at, updated_at) VALUES (?, ?, 'Large goal', 1000, 'save', NULL, 1, 1, ?, ?)`).bind(goalB, fixture.childAId, now, now),
      DB.prepare(`INSERT INTO savings_goals (id, child_id, name, target_minor, icon_key, encouragement, display_order, active, created_at, updated_at) VALUES (?, ?, 'Other child goal', 300, 'toy', NULL, 0, 1, ?, ?)`).bind(otherGoal, fixture.childBId, now, now),
    ]);
    const goals = await request('/child/goals', { cookie: fixture.childACookie });
    expect(goals.status).toBe(200);
    const body = await goals.json<any[]>();
    expect(body.map((goal) => [goal.name, goal.progressMinor])).toEqual([['Small goal', 500], ['Large goal', 700]]);
    expect(JSON.stringify(body)).not.toContain('Other child goal');
    expect((await request('/child/goals/spotlight', { cookie: fixture.childACookie, method: 'PUT', body: { goalId: goalB } })).status).toBe(200);
    expect((await request('/child/goals/spotlight', { cookie: fixture.childACookie, method: 'PUT', body: { goalId: otherGoal } })).status).toBe(404);
    expect((await request(`/parent/goals/${goalA}`, { cookie: fixture.childACookie, method: 'PATCH', body: { targetMinor: 1 } })).status).toBe(403);
  });
});
