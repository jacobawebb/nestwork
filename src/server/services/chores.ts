import type { z } from 'zod';
import type { choreTemplateInputSchema } from '@/lib/contracts';
import { auditStatement } from '../audit';
import { all, first, run } from '../db/client';
import { materializeHorizon } from '../domain/recurrence';
import { ApiError } from '../errors';
import type { ChildActor, ParentActor } from '../types';
import { householdContext } from './household';

type ChoreInput = z.infer<typeof choreTemplateInputSchema>;

interface TemplateRow {
  id: string;
  household_id: string;
  title: string;
  instructions: string | null;
  assignment_type: 'ASSIGNED' | 'GENERAL';
  assigned_child_id: string | null;
  amount_minor: number;
  currency: string;
  approval_mode: 'PARENT_APPROVAL' | 'AUTO_APPROVE';
  recurrence_json: string;
  active: number;
}

interface InstanceRow {
  id: string;
  household_id: string;
  template_id: string | null;
  assigned_child_id: string | null;
  claimed_by_child_id: string | null;
  title_snapshot: string;
  instructions_snapshot: string | null;
  amount_minor_snapshot: number;
  currency_snapshot: string;
  approval_mode_snapshot: 'PARENT_APPROVAL' | 'AUTO_APPROVE';
  assignment_type_snapshot: 'ASSIGNED' | 'GENERAL';
  status: string;
  available_at: string;
  due_at: string | null;
  expires_at: string | null;
}

function instanceInsertStatement(db: D1Database, template: TemplateRow, occurrence: ReturnType<typeof materializeHorizon>[number], now: string) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO chore_instances
       (id, template_id, household_id, occurrence_key, assigned_child_id, claimed_by_child_id,
        title_snapshot, instructions_snapshot, amount_minor_snapshot, currency_snapshot, approval_mode_snapshot,
        assignment_type_snapshot, status, available_at, due_at, expires_at, completed_at, reviewed_at,
        reviewer_id, return_reason, completion_note, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      template.id,
      template.household_id,
      occurrence.occurrenceKey,
      template.assigned_child_id,
      template.title,
      template.instructions,
      template.amount_minor,
      template.currency,
      template.approval_mode,
      template.assignment_type,
      occurrence.initialStatus,
      occurrence.availableAt,
      occurrence.dueAt,
      occurrence.expiresAt,
      now,
    );
}

async function assertChildrenInHousehold(db: D1Database, householdId: string, childIds: string[]) {
  if (!childIds.length) return;
  const placeholders = childIds.map(() => '?').join(',');
  const row = await first<{ count: number }>(
    db,
    `SELECT COUNT(*) AS count FROM children WHERE household_id = ? AND active = 1 AND id IN (${placeholders})`,
    householdId,
    ...childIds,
  );
  if (row?.count !== new Set(childIds).size) throw new ApiError(400, 'Choose active children from this household.', 'INVALID_CHILD');
}

export async function refreshTimeStates(db: D1Database, householdId?: string, now = new Date()): Promise<void> {
  const time = now.toISOString();
  const householdClause = householdId ? ' AND household_id = ?' : '';
  const params = householdId ? [time, householdId] : [time];
  await db.batch([
    db.prepare(`UPDATE chore_instances SET status = 'AVAILABLE' WHERE status = 'SCHEDULED' AND available_at <= ?${householdClause}`).bind(...params),
    db
      .prepare(
        `UPDATE chore_instances SET status = 'EXPIRED'
         WHERE status IN ('SCHEDULED','AVAILABLE','CLAIMED','RETURNED_TO_CHILD') AND expires_at IS NOT NULL AND expires_at <= ?${householdClause}`,
      )
      .bind(...params),
  ]);
}

export async function createTemplate(db: D1Database, actor: ParentActor, input: ChoreInput) {
  const context = await householdContext(db, actor.householdId);
  const childIds = input.assignmentType === 'ASSIGNED' ? [input.assignedChildId!] : input.eligibleChildIds;
  await assertChildrenInHousehold(db, actor.householdId, childIds);
  const id = crypto.randomUUID();
  const now = new Date();
  const timestamp = now.toISOString();
  const template: TemplateRow = {
    id,
    household_id: actor.householdId,
    title: input.title,
    instructions: input.instructions ?? null,
    assignment_type: input.assignmentType,
    assigned_child_id: input.assignmentType === 'ASSIGNED' ? input.assignedChildId! : null,
    amount_minor: input.amountMinor,
    currency: context.currency,
    approval_mode: input.approvalMode,
    recurrence_json: JSON.stringify(input.recurrence),
    active: 1,
  };
  const occurrences = materializeHorizon(input.recurrence, context.timeZone, now);
  if (input.recurrence.kind === 'ONCE' && occurrences.length === 0) {
    throw new ApiError(400, 'Choose today or a future date within the schedule horizon.', 'INVALID_START_DATE');
  }
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO chore_templates
         (id, household_id, title, instructions, assignment_type, assigned_child_id, amount_minor, currency,
          approval_mode, recurrence_json, active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        id,
        actor.householdId,
        template.title,
        template.instructions,
        template.assignment_type,
        template.assigned_child_id,
        template.amount_minor,
        template.currency,
        template.approval_mode,
        template.recurrence_json,
        actor.id,
        timestamp,
        timestamp,
      ),
  ];
  for (const childId of input.assignmentType === 'GENERAL' ? input.eligibleChildIds : []) {
    statements.push(
      db
        .prepare('INSERT INTO chore_template_eligibility (template_id, child_id, household_id) VALUES (?, ?, ?)')
        .bind(id, childId, actor.householdId),
    );
  }
  for (const occurrence of occurrences) statements.push(instanceInsertStatement(db, template, occurrence, timestamp));
  statements.push(
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'CHORE_TEMPLATE_CREATED',
      entityType: 'CHORE_TEMPLATE',
      entityId: id,
      metadata: { assignmentType: input.assignmentType, amountMinor: input.amountMinor },
      at: timestamp,
    }),
  );
  await db.batch(statements);
  return { id, instancesCreated: occurrences.length };
}

export async function listTemplates(db: D1Database, actor: ParentActor) {
  const rows = await all<TemplateRow & { instance_count: number; eligibility: string | null }>(
    db,
    `SELECT t.*, COUNT(DISTINCT i.id) AS instance_count, GROUP_CONCAT(DISTINCT e.child_id) AS eligibility
     FROM chore_templates t
     LEFT JOIN chore_instances i ON i.template_id = t.id
     LEFT JOIN chore_template_eligibility e ON e.template_id = t.id
     WHERE t.household_id = ? GROUP BY t.id ORDER BY t.active DESC, t.created_at DESC`,
    actor.householdId,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    assignmentType: row.assignment_type,
    assignedChildId: row.assigned_child_id,
    eligibleChildIds: row.eligibility ? row.eligibility.split(',') : [],
    amountMinor: row.amount_minor,
    currency: row.currency,
    approvalMode: row.approval_mode,
    recurrence: JSON.parse(row.recurrence_json),
    active: Boolean(row.active),
    instanceCount: row.instance_count,
  }));
}

export async function updateTemplate(db: D1Database, actor: ParentActor, templateId: string, input: ChoreInput) {
  const existing = await first<TemplateRow>(db, 'SELECT * FROM chore_templates WHERE id = ? AND household_id = ?', templateId, actor.householdId);
  if (!existing) throw new ApiError(404, 'Chore template not found.', 'NOT_FOUND');
  const childIds = input.assignmentType === 'ASSIGNED' ? [input.assignedChildId!] : input.eligibleChildIds;
  await assertChildrenInHousehold(db, actor.householdId, childIds);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE chore_templates SET title = ?, instructions = ?, assignment_type = ?, assigned_child_id = ?,
         amount_minor = ?, approval_mode = ?, recurrence_json = ?, updated_at = ? WHERE id = ? AND household_id = ?`,
      )
      .bind(
        input.title,
        input.instructions ?? null,
        input.assignmentType,
        input.assignmentType === 'ASSIGNED' ? input.assignedChildId! : null,
        input.amountMinor,
        input.approvalMode,
        JSON.stringify(input.recurrence),
        now,
        templateId,
        actor.householdId,
      ),
    db.prepare('DELETE FROM chore_template_eligibility WHERE template_id = ?').bind(templateId),
  ];
  for (const childId of input.assignmentType === 'GENERAL' ? input.eligibleChildIds : []) {
    statements.push(
      db
        .prepare('INSERT INTO chore_template_eligibility (template_id, child_id, household_id) VALUES (?, ?, ?)')
        .bind(templateId, childId, actor.householdId),
    );
  }
  statements.push(
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'CHORE_TEMPLATE_UPDATED',
      entityType: 'CHORE_TEMPLATE',
      entityId: templateId,
      metadata: { existingInstancesRemainSnapshotted: true },
      at: now,
    }),
  );
  await db.batch(statements);
  return { id: templateId };
}

export async function archiveTemplate(db: D1Database, actor: ParentActor, templateId: string, active = false) {
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare('UPDATE chore_templates SET active = ?, updated_at = ? WHERE id = ? AND household_id = ?').bind(Number(active), now, templateId, actor.householdId),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: active ? 'CHORE_TEMPLATE_REACTIVATED' : 'CHORE_TEMPLATE_ARCHIVED',
      entityType: 'CHORE_TEMPLATE',
      entityId: templateId,
      at: now,
    }),
  ]);
  if (!results[0]?.meta.changes) throw new ApiError(404, 'Chore template not found.', 'NOT_FOUND');
  return { id: templateId, active };
}

export async function deleteUnusedTemplate(db: D1Database, actor: ParentActor, templateId: string) {
  const count = await first<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM chore_instances WHERE template_id = ?', templateId);
  if (count?.count) throw new ApiError(409, 'Archive templates that have generated chores.', 'ARCHIVE_REQUIRED');
  const results = await db.batch([
    db.prepare('DELETE FROM chore_templates WHERE id = ? AND household_id = ?').bind(templateId, actor.householdId),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'CHORE_TEMPLATE_DELETED',
      entityType: 'CHORE_TEMPLATE',
      entityId: templateId,
    }),
  ]);
  if (!results[0]?.meta.changes) throw new ApiError(404, 'Chore template not found.', 'NOT_FOUND');
  return { id: templateId };
}

export async function claimChore(db: D1Database, actor: ChildActor, instanceId: string) {
  await refreshTimeStates(db, actor.householdId);
  const now = new Date().toISOString();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE chore_instances SET claimed_by_child_id = ?, status = 'CLAIMED'
         WHERE id = ? AND household_id = ? AND assignment_type_snapshot = 'GENERAL' AND status = 'AVAILABLE'
           AND available_at <= ? AND (expires_at IS NULL OR expires_at > ?)
           AND (
             NOT EXISTS (SELECT 1 FROM chore_template_eligibility e WHERE e.template_id = chore_instances.template_id)
             OR EXISTS (SELECT 1 FROM chore_template_eligibility e WHERE e.template_id = chore_instances.template_id AND e.child_id = ?)
           )`,
      )
      .bind(actor.id, instanceId, actor.householdId, now, now, actor.id),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'CHORE_CLAIMED',
      entityType: 'CHORE_INSTANCE',
      entityId: instanceId,
      at: now,
    }),
  ]);
  if (!results[0]?.meta.changes) throw new ApiError(409, 'That chore is no longer available to claim.', 'CLAIM_CONFLICT');
  return { id: instanceId, status: 'CLAIMED' as const };
}

export async function releaseClaim(db: D1Database, actor: ChildActor, instanceId: string) {
  const now = new Date().toISOString();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE chore_instances SET claimed_by_child_id = NULL, status = 'AVAILABLE'
         WHERE id = ? AND household_id = ? AND claimed_by_child_id = ? AND status = 'CLAIMED'
           AND EXISTS (SELECT 1 FROM household_settings s WHERE s.household_id = chore_instances.household_id AND s.child_release_enabled = 1)`,
      )
      .bind(instanceId, actor.householdId, actor.id),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'CHORE_RELEASED_BY_CHILD',
      entityType: 'CHORE_INSTANCE',
      entityId: instanceId,
      at: now,
    }),
  ]);
  if (!results[0]?.meta.changes) throw new ApiError(409, 'This chore cannot be released.', 'RELEASE_NOT_ALLOWED');
  return { id: instanceId, status: 'AVAILABLE' as const };
}

export async function completeChore(db: D1Database, actor: ChildActor, instanceId: string, note: string | null) {
  await refreshTimeStates(db, actor.householdId);
  const instance = await first<InstanceRow>(
    db,
    `SELECT * FROM chore_instances WHERE id = ? AND household_id = ?
     AND (assigned_child_id = ? OR claimed_by_child_id = ?)`,
    instanceId,
    actor.householdId,
    actor.id,
    actor.id,
  );
  if (!instance || !['AVAILABLE', 'CLAIMED', 'RETURNED_TO_CHILD'].includes(instance.status)) {
    throw new ApiError(409, 'This chore cannot be completed.', 'INVALID_CHORE_STATE');
  }
  const now = new Date().toISOString();
  if (instance.expires_at && instance.expires_at <= now) throw new ApiError(409, 'This chore has expired.', 'CHORE_EXPIRED');
  const auto = instance.approval_mode_snapshot === 'AUTO_APPROVE';
  const nextStatus = auto ? 'APPROVED' : 'COMPLETED_PENDING_REVIEW';
  const childId = instance.assigned_child_id ?? instance.claimed_by_child_id!;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE chore_instances SET status = ?, completion_note = ?, completed_at = ?, reviewed_at = ?, return_reason = NULL
         WHERE id = ? AND household_id = ? AND status IN ('AVAILABLE','CLAIMED','RETURNED_TO_CHILD')`,
      )
      .bind(nextStatus, note, now, auto ? now : null, instanceId, actor.householdId),
  ];
  if (auto) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO ledger_entries
           (id, household_id, child_id, chore_instance_id, type, amount_minor, currency, reason, created_by_parent_id, created_at)
           VALUES (?, ?, ?, ?, 'EARNING', ?, ?, 'Auto-approved chore', NULL, ?)`,
        )
        .bind(crypto.randomUUID(), actor.householdId, childId, instanceId, instance.amount_minor_snapshot, instance.currency_snapshot, now),
    );
  }
  statements.push(
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: auto ? 'CHORE_AUTO_APPROVED' : 'CHORE_COMPLETED',
      entityType: 'CHORE_INSTANCE',
      entityId: instanceId,
      metadata: { noteProvided: Boolean(note) },
      at: now,
    }),
  );
  const results = await db.batch(statements);
  if (!results[0]?.meta.changes) throw new ApiError(409, 'This chore was already updated.', 'CHORE_CONFLICT');
  return { id: instanceId, status: nextStatus, earnedMinor: auto ? instance.amount_minor_snapshot : null };
}

export async function reviewChore(
  db: D1Database,
  actor: ParentActor,
  instanceId: string,
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  reason?: string,
) {
  const instance = await first<InstanceRow>(db, 'SELECT * FROM chore_instances WHERE id = ? AND household_id = ?', instanceId, actor.householdId);
  if (!instance) throw new ApiError(404, 'Chore not found.', 'NOT_FOUND');
  if (action === 'APPROVE' && instance.status === 'APPROVED') return { id: instanceId, status: 'APPROVED', idempotent: true };
  if (instance.status !== 'COMPLETED_PENDING_REVIEW') throw new ApiError(409, 'This chore is not waiting for review.', 'INVALID_CHORE_STATE');
  if ((action === 'REJECT' || action === 'RETURN') && !reason?.trim()) {
    throw new ApiError(400, 'Add a kind reason.', 'REASON_REQUIRED');
  }
  const now = new Date().toISOString();
  const status = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'RETURNED_TO_CHILD';
  const childId = instance.assigned_child_id ?? instance.claimed_by_child_id;
  if (!childId) throw new ApiError(409, 'The chore has no child assigned.', 'INVALID_CHORE');
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE chore_instances SET status = ?, reviewed_at = ?, reviewer_id = ?, return_reason = ?
         WHERE id = ? AND household_id = ? AND status = 'COMPLETED_PENDING_REVIEW'`,
      )
      .bind(status, now, actor.id, action === 'APPROVE' ? null : reason!.trim(), instanceId, actor.householdId),
  ];
  if (action === 'APPROVE') {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO ledger_entries
           (id, household_id, child_id, chore_instance_id, type, amount_minor, currency, reason, created_by_parent_id, created_at)
           VALUES (?, ?, ?, ?, 'EARNING', ?, ?, 'Approved chore', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor.householdId,
          childId,
          instanceId,
          instance.amount_minor_snapshot,
          instance.currency_snapshot,
          actor.id,
          now,
        ),
    );
  }
  statements.push(
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: `CHORE_${action === 'RETURN' ? 'RETURNED' : action + 'D'}`,
      entityType: 'CHORE_INSTANCE',
      entityId: instanceId,
      metadata: action === 'APPROVE' ? { amountMinor: instance.amount_minor_snapshot } : { reason },
      at: now,
    }),
  );
  const results = await db.batch(statements);
  if (!results[0]?.meta.changes) {
    if (action === 'APPROVE') {
      const current = await first<{ status: string }>(db, 'SELECT status FROM chore_instances WHERE id = ?', instanceId);
      if (current?.status === 'APPROVED') return { id: instanceId, status: 'APPROVED', idempotent: true };
    }
    throw new ApiError(409, 'This chore was already reviewed.', 'CHORE_CONFLICT');
  }
  return { id: instanceId, status, idempotent: false };
}

export async function returnToBoard(db: D1Database, actor: ParentActor, instanceId: string) {
  const now = new Date().toISOString();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE chore_instances SET status = 'AVAILABLE', claimed_by_child_id = NULL, return_reason = NULL,
         completed_at = NULL, reviewed_at = NULL, reviewer_id = NULL, completion_note = NULL
         WHERE id = ? AND household_id = ? AND assignment_type_snapshot = 'GENERAL'
           AND claimed_by_child_id IS NOT NULL AND status IN ('CLAIMED','RETURNED_TO_CHILD','COMPLETED_PENDING_REVIEW')`,
      )
      .bind(instanceId, actor.householdId),
    auditStatement(db, {
      householdId: actor.householdId,
      actor,
      action: 'CHORE_RETURNED_TO_BOARD',
      entityType: 'CHORE_INSTANCE',
      entityId: instanceId,
      at: now,
    }),
  ]);
  if (!results[0]?.meta.changes) throw new ApiError(409, 'This chore cannot be returned to the board.', 'INVALID_CHORE_STATE');
  return { id: instanceId, status: 'AVAILABLE' as const };
}

export async function runScheduledMaintenance(db: D1Database, now = new Date()) {
  await refreshTimeStates(db, undefined, now);
  const templates = await all<TemplateRow & { time_zone: string }>(
    db,
    `SELECT t.*, h.time_zone FROM chore_templates t JOIN households h ON h.id = t.household_id WHERE t.active = 1`,
  );
  let attempted = 0;
  const timestamp = now.toISOString();
  for (const template of templates) {
    const occurrences = materializeHorizon(JSON.parse(template.recurrence_json), template.time_zone, now);
    if (!occurrences.length) continue;
    attempted += occurrences.length;
    await db.batch(occurrences.map((occurrence) => instanceInsertStatement(db, template, occurrence, timestamp)));
  }
  await run(db, 'DELETE FROM auth_attempts WHERE locked_until IS NOT NULL AND locked_until < ?', new Date(now.getTime() - 86_400_000).toISOString());
  return { templates: templates.length, occurrencesAttempted: attempted };
}

export async function listParentInstances(db: D1Database, actor: ParentActor) {
  await refreshTimeStates(db, actor.householdId);
  const rows = await all<InstanceRow & { child_name: string | null }>(
    db,
    `SELECT i.*, COALESCE(ac.display_name, cc.display_name) AS child_name
     FROM chore_instances i
     LEFT JOIN children ac ON ac.id = i.assigned_child_id
     LEFT JOIN children cc ON cc.id = i.claimed_by_child_id
     WHERE i.household_id = ? ORDER BY
       CASE i.status WHEN 'COMPLETED_PENDING_REVIEW' THEN 0 WHEN 'AVAILABLE' THEN 1 WHEN 'CLAIMED' THEN 2 ELSE 3 END,
       i.available_at DESC LIMIT 200`,
    actor.householdId,
  );
  return rows.map(mapInstance);
}

export async function listChildInstances(db: D1Database, actor: ChildActor) {
  await refreshTimeStates(db, actor.householdId);
  const context = await householdContext(db, actor.householdId);
  const [mine, board] = await Promise.all([
    all<InstanceRow>(
      db,
      `SELECT * FROM chore_instances WHERE household_id = ?
       AND (assigned_child_id = ? OR claimed_by_child_id = ?)
       ORDER BY available_at DESC LIMIT 100`,
      actor.householdId,
      actor.id,
      actor.id,
    ),
    all<InstanceRow>(
      db,
      `SELECT i.* FROM chore_instances i
       WHERE i.household_id = ? AND i.assignment_type_snapshot = 'GENERAL' AND i.status = 'AVAILABLE'
         AND i.available_at <= ? AND (i.expires_at IS NULL OR i.expires_at > ?)
         AND (
           NOT EXISTS (SELECT 1 FROM chore_template_eligibility e WHERE e.template_id = i.template_id)
           OR EXISTS (SELECT 1 FROM chore_template_eligibility e WHERE e.template_id = i.template_id AND e.child_id = ?)
         )
       ORDER BY i.available_at, i.amount_minor_snapshot DESC LIMIT ?`,
      actor.householdId,
      new Date().toISOString(),
      new Date().toISOString(),
      actor.id,
      context.settings.childBoardLimit,
    ),
  ]);
  return { mine: mine.map(mapInstance), board: board.map(mapInstance) };
}

function mapInstance(row: InstanceRow & { child_name?: string | null }) {
  return {
    id: row.id,
    templateId: row.template_id,
    assignedChildId: row.assigned_child_id,
    claimedByChildId: row.claimed_by_child_id,
    childName: row.child_name ?? null,
    title: row.title_snapshot,
    instructions: row.instructions_snapshot,
    amountMinor: row.amount_minor_snapshot,
    currency: row.currency_snapshot,
    approvalMode: row.approval_mode_snapshot,
    assignmentType: row.assignment_type_snapshot,
    status: row.status,
    availableAt: row.available_at,
    dueAt: row.due_at,
    expiresAt: row.expires_at,
  };
}
