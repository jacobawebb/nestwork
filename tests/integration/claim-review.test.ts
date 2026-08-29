import { describe, expect, it } from 'vitest';
import { bindings, createFixture, insertTemplateAndInstance, request } from './helpers';

describe('claim, completion, review, snapshots, and expiry', () => {
  it('allows exactly one simultaneous claimant and credits approval exactly once', async () => {
    const fixture = await createFixture('claim');
    const { DB } = bindings();
    const { instanceId } = await insertTemplateAndInstance(fixture, { assignmentType: 'GENERAL', status: 'AVAILABLE', amountMinor: 375 });
    const [a, b] = await Promise.all([
      request(`/child/chores/${instanceId}/claim`, { cookie: fixture.childACookie, body: {} }),
      request(`/child/chores/${instanceId}/claim`, { cookie: fixture.childBCookie, body: {} }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await DB.prepare(`SELECT COUNT(*) AS count FROM audit_events WHERE entity_id = ? AND action = 'CHORE_CLAIMED'`).bind(instanceId).first<{ count: number }>())?.count).toBe(1);
    const winningCookie = a.status === 200 ? fixture.childACookie : fixture.childBCookie;
    const completed = await request(`/child/chores/${instanceId}/complete`, { cookie: winningCookie, body: { note: 'Finished carefully' } });
    expect(completed.status).toBe(200);
    const firstApproval = await request(`/parent/chores/${instanceId}/review`, { cookie: fixture.ownerCookie, body: { action: 'APPROVE' } });
    const retryApproval = await request(`/parent/chores/${instanceId}/review`, { cookie: fixture.ownerCookie, body: { action: 'APPROVE' } });
    expect(firstApproval.status).toBe(200);
    expect(retryApproval.status).toBe(200);
    const entries = await DB.prepare(`SELECT COUNT(*) AS count, SUM(amount_minor) AS amount FROM ledger_entries WHERE chore_instance_id = ? AND type = 'EARNING'`).bind(instanceId).first<{ count: number; amount: number }>();
    expect(entries).toEqual({ count: 1, amount: 375 });
    expect((await DB.prepare(`SELECT COUNT(*) AS count FROM audit_events WHERE entity_id = ? AND action = 'CHORE_APPROVED'`).bind(instanceId).first<{ count: number }>())?.count).toBe(1);
  });

  it('creates no earning for rejection or return', async () => {
    const fixture = await createFixture('review-no-credit');
    const rejected = await insertTemplateAndInstance(fixture, { status: 'COMPLETED_PENDING_REVIEW' });
    const returned = await insertTemplateAndInstance(fixture, { status: 'COMPLETED_PENDING_REVIEW' });
    expect((await request(`/parent/chores/${rejected.instanceId}/review`, { cookie: fixture.parentCookie, body: { action: 'REJECT', reason: 'Please ask before changing this task.' } })).status).toBe(200);
    expect((await request(`/parent/chores/${returned.instanceId}/review`, { cookie: fixture.parentCookie, body: { action: 'RETURN', reason: 'One small part still needs doing.' } })).status).toBe(200);
    const returnedView = await request('/child/chores', { cookie: fixture.childACookie });
    expect((await returnedView.json<any>()).mine.find((chore: any) => chore.id === returned.instanceId)?.returnReason).toBe('One small part still needs doing.');
    const row = await bindings().DB.prepare(`SELECT COUNT(*) AS count FROM ledger_entries WHERE chore_instance_id IN (?, ?)`).bind(rejected.instanceId, returned.instanceId).first<{ count: number }>();
    expect(row?.count).toBe(0);
  });

  it('lets a parent cancel an unfinished instance exactly once without creating an earning', async () => {
    const fixture = await createFixture('cancel-instance');
    const { DB } = bindings();
    const { instanceId } = await insertTemplateAndInstance(fixture, { status: 'AVAILABLE' });
    expect((await request(`/parent/chores/${instanceId}/cancel`, { cookie: fixture.parentCookie, body: {} })).status).toBe(200);
    expect((await request(`/parent/chores/${instanceId}/cancel`, { cookie: fixture.parentCookie, body: {} })).status).toBe(409);
    expect((await request(`/child/chores/${instanceId}/complete`, { cookie: fixture.childACookie, body: { note: null } })).status).toBe(409);
    expect((await DB.prepare('SELECT status FROM chore_instances WHERE id = ?').bind(instanceId).first<{ status: string }>())?.status).toBe('CANCELLED');
    expect((await DB.prepare('SELECT COUNT(*) AS count FROM ledger_entries WHERE chore_instance_id = ?').bind(instanceId).first<{ count: number }>())?.count).toBe(0);
    expect((await DB.prepare(`SELECT COUNT(*) AS count FROM audit_events WHERE entity_id = ? AND action = 'CHORE_CANCELLED'`).bind(instanceId).first<{ count: number }>())?.count).toBe(1);
    await expect(DB.prepare('DELETE FROM chore_instances WHERE id = ?').bind(instanceId).run()).rejects.toThrow(/immutable/i);
  });

  it('keeps a returned general chore with its claimant until Return to board releases it once', async () => {
    const fixture = await createFixture('return-board');
    const { instanceId } = await insertTemplateAndInstance(fixture, { assignmentType: 'GENERAL', claimedChildId: fixture.childAId, status: 'RETURNED_TO_CHILD' });
    expect((await request(`/child/chores/${instanceId}/claim`, { cookie: fixture.childBCookie, body: {} })).status).toBe(409);
    expect((await request(`/parent/chores/${instanceId}/return-to-board`, { cookie: fixture.ownerCookie, body: {} })).status).toBe(200);
    expect((await request(`/parent/chores/${instanceId}/return-to-board`, { cookie: fixture.ownerCookie, body: {} })).status).toBe(409);
    expect((await request(`/child/chores/${instanceId}/claim`, { cookie: fixture.childBCookie, body: {} })).status).toBe(200);
  });

  it('expires unfinished chores without earnings and requires archive after generation', async () => {
    const fixture = await createFixture('expiry');
    const { DB } = bindings();
    const { instanceId, templateId } = await insertTemplateAndInstance(fixture, { status: 'AVAILABLE', expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await request(`/child/chores/${instanceId}/complete`, { cookie: fixture.childACookie, body: { note: null } })).status).toBe(409);
    const state = await DB.prepare('SELECT status FROM chore_instances WHERE id = ?').bind(instanceId).first<{ status: string }>();
    expect(state?.status).toBe('EXPIRED');
    expect((await DB.prepare('SELECT COUNT(*) AS count FROM ledger_entries WHERE chore_instance_id = ?').bind(instanceId).first<{ count: number }>())?.count).toBe(0);
    expect((await request(`/parent/templates/${templateId}`, { cookie: fixture.ownerCookie, method: 'DELETE' })).status).toBe(409);
    expect((await request(`/parent/templates/${templateId}/archive`, { cookie: fixture.ownerCookie, body: { active: false } })).status).toBe(200);
  });

  it('does not mutate completed instance snapshots when the template is edited', async () => {
    const fixture = await createFixture('snapshot');
    const { DB } = bindings();
    const original = await insertTemplateAndInstance(fixture, { title: 'Original title', amountMinor: 225, status: 'APPROVED' });
    const today = new Date().toLocaleDateString('en-CA');
    const response = await request(`/parent/templates/${original.templateId}`, {
      cookie: fixture.ownerCookie,
      method: 'PUT',
      body: { title: 'Changed title', instructions: null, assignmentType: 'ASSIGNED', assignedChildId: fixture.childAId, eligibleChildIds: [], amountMinor: 999, approvalMode: 'PARENT_APPROVAL', recurrence: { kind: 'ONCE', startDate: today, availableTime: '08:00', dueTime: null, expiryTime: null } },
    });
    expect(response.status).toBe(200);
    const instance = await DB.prepare('SELECT title_snapshot, amount_minor_snapshot FROM chore_instances WHERE id = ?').bind(original.instanceId).first<{ title_snapshot: string; amount_minor_snapshot: number }>();
    expect(instance).toEqual({ title_snapshot: 'Original title', amount_minor_snapshot: 225 });
  });
});
