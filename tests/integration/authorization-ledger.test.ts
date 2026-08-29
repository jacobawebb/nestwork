import { describe, expect, it } from 'vitest';
import { bindings, createFixture, insertTemplateAndInstance, request } from './helpers';

describe('household and child authorization with ledger guards', () => {
  it('never exposes another child’s chores, history, balance, or goals', async () => {
    const fixture = await createFixture('privacy');
    const { DB } = bindings();
    const now = new Date().toISOString();
    await DB.prepare(`INSERT INTO ledger_entries (id, household_id, child_id, chore_instance_id, type, amount_minor, currency, reason, created_by_parent_id, created_at) VALUES (?, ?, ?, NULL, 'ADJUSTMENT', 9900, 'GBP', 'private fixture', ?, ?)`).bind(crypto.randomUUID(), fixture.householdId, fixture.childBId, fixture.ownerId, now).run();
    await insertTemplateAndInstance(fixture, { assignedChildId: fixture.childBId, title: 'Other child private chore' });
    const response = await request('/child/home', { cookie: fixture.childACookie });
    expect(response.status).toBe(200);
    const body = await response.json<any>();
    expect(body.balanceMinor).toBe(0);
    expect(JSON.stringify(body)).not.toContain('Other child private chore');
    expect(JSON.stringify(body)).not.toContain('private fixture');
    expect(body.actor.id).toBe(fixture.childAId);
  });

  it('blocks every parent-only mutation from a child session', async () => {
    const fixture = await createFixture('child-policy');
    const responses = await Promise.all([
      request('/parent/ledger', { cookie: fixture.childACookie, body: { childId: fixture.childAId, type: 'ADJUSTMENT', amountMinor: 100, reason: 'not allowed', confirmNegative: false } }),
      request('/parent/templates', { cookie: fixture.childACookie, body: { title: 'not allowed' } }),
      request(`/parent/chores/${crypto.randomUUID()}/review`, { cookie: fixture.childACookie, body: { action: 'APPROVE' } }),
      request('/parent/goals', { cookie: fixture.childACookie, body: { childId: fixture.childAId, name: 'not allowed', targetMinor: 100, iconKey: 'target' } }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
  });

  it('rejects cross-household identifiers even for a signed-in parent', async () => {
    const householdA = await createFixture('house-a');
    const householdB = await createFixture('house-b');
    const { instanceId } = await insertTemplateAndInstance(householdB, { status: 'COMPLETED_PENDING_REVIEW' });
    const response = await request(`/parent/chores/${instanceId}/review`, { cookie: householdA.ownerCookie, body: { action: 'APPROVE' } });
    expect(response.status).toBe(404);
    const earning = await bindings().DB.prepare(`SELECT COUNT(*) AS count FROM ledger_entries WHERE chore_instance_id = ?`).bind(instanceId).first<{ count: number }>();
    expect(earning?.count).toBe(0);
  });

  it('prevents payouts over the derived available balance', async () => {
    const fixture = await createFixture('payout');
    const { DB } = bindings();
    await DB.prepare(`INSERT INTO ledger_entries (id, household_id, child_id, chore_instance_id, type, amount_minor, currency, reason, created_by_parent_id, created_at) VALUES (?, ?, ?, NULL, 'ADJUSTMENT', 500, 'GBP', 'opening correction', ?, ?)`).bind(crypto.randomUUID(), fixture.householdId, fixture.childAId, fixture.ownerId, new Date().toISOString()).run();
    const tooMuch = await request('/parent/ledger', { cookie: fixture.ownerCookie, body: { childId: fixture.childAId, type: 'PAYOUT', amountMinor: 600, reason: 'Cash', confirmNegative: false } });
    expect(tooMuch.status).toBe(409);
    const allowed = await request('/parent/ledger', { cookie: fixture.ownerCookie, body: { childId: fixture.childAId, type: 'PAYOUT', amountMinor: 300, reason: 'Cash', confirmNegative: false } });
    expect(allowed.status).toBe(201);
    const balance = await DB.prepare('SELECT SUM(amount_minor) AS balance FROM ledger_entries WHERE child_id = ?').bind(fixture.childAId).first<{ balance: number }>();
    expect(balance?.balance).toBe(200);
  });

  it('keeps simultaneous payouts inside the available balance atomically', async () => {
    const fixture = await createFixture('concurrent-payout');
    const { DB } = bindings();
    await DB.prepare(`INSERT INTO ledger_entries (id, household_id, child_id, chore_instance_id, type, amount_minor, currency, reason, created_by_parent_id, created_at) VALUES (?, ?, ?, NULL, 'ADJUSTMENT', 500, 'GBP', 'opening correction', ?, ?)`).bind(crypto.randomUUID(), fixture.householdId, fixture.childAId, fixture.ownerId, new Date().toISOString()).run();
    const [first, second] = await Promise.all([
      request('/parent/ledger', { cookie: fixture.ownerCookie, body: { childId: fixture.childAId, type: 'PAYOUT', amountMinor: 400, reason: 'Cash one', confirmNegative: false } }),
      request('/parent/ledger', { cookie: fixture.ownerCookie, body: { childId: fixture.childAId, type: 'PAYOUT', amountMinor: 400, reason: 'Cash two', confirmNegative: false } }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const result = await DB.prepare(`SELECT SUM(amount_minor) AS balance, SUM(CASE WHEN type = 'PAYOUT' THEN 1 ELSE 0 END) AS payouts FROM ledger_entries WHERE child_id = ?`).bind(fixture.childAId).first<{ balance: number; payouts: number }>();
    expect(result).toEqual({ balance: 100, payouts: 1 });
  });

  it('prevents a household currency change after immutable ledger history exists', async () => {
    const fixture = await createFixture('currency-history');
    await bindings().DB.prepare(`INSERT INTO ledger_entries (id, household_id, child_id, chore_instance_id, type, amount_minor, currency, reason, created_by_parent_id, created_at) VALUES (?, ?, ?, NULL, 'ADJUSTMENT', 100, 'GBP', 'opening correction', ?, ?)`).bind(crypto.randomUUID(), fixture.householdId, fixture.childAId, fixture.ownerId, new Date().toISOString()).run();
    const response = await request('/parent/settings', { cookie: fixture.ownerCookie, method: 'PUT', body: { name: 'Currency fixture', locale: 'en-US', timeZone: 'Europe/London', currency: 'USD', defaultApprovalMode: 'PARENT_APPROVAL', childReleaseEnabled: true, childBoardLimit: 5, savingsGoalsEnabled: true } });
    expect(response.status).toBe(409);
    expect(await response.json<any>()).toMatchObject({ error: { code: 'CURRENCY_CHANGE_BLOCKED' } });
  });

  it('rejects an expired session from a direct protected URL', async () => {
    const fixture = await createFixture('expired-session');
    const { DB } = bindings();
    await DB.prepare(`UPDATE child_sessions SET idle_expires_at = ? WHERE child_id = ?`).bind(new Date().toISOString(), fixture.childAId).run();
    const response = await request('/child/home', { cookie: fixture.childACookie });
    expect(response.status).toBe(401);
    expect(await response.json<any>()).toMatchObject({ error: { code: 'SESSION_LOCKED' } });
  });
});
