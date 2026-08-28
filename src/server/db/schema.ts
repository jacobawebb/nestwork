import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const appInstallation = sqliteTable('app_installation', {
  id: integer('id').primaryKey(),
  setupCompletedAt: text('setup_completed_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const households = sqliteTable('households', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  currency: text('currency').notNull(),
  locale: text('locale').notNull(),
  timeZone: text('time_zone').notNull(),
  createdAt: text('created_at').notNull(),
});

export const householdSettings = sqliteTable('household_settings', {
  householdId: text('household_id').primaryKey(),
  defaultApprovalMode: text('default_approval_mode').notNull(),
  childReleaseEnabled: integer('child_release_enabled', { mode: 'boolean' }).notNull(),
  childBoardLimit: integer('child_board_limit').notNull(),
  savingsGoalsEnabled: integer('savings_goals_enabled', { mode: 'boolean' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const parentUsers = sqliteTable(
  'parent_users',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    avatarKey: text('avatar_key').notNull(),
    accentKey: text('accent_key').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').$type<'OWNER' | 'PARENT'>().notNull(),
    active: integer('active', { mode: 'boolean' }).notNull(),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('parents_household_email').on(table.householdId, table.email)],
);

export const children = sqliteTable(
  'children',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    displayName: text('display_name').notNull(),
    avatarKey: text('avatar_key').notNull(),
    accentKey: text('accent_key').notNull(),
    pinHash: text('pin_hash').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('children_household_active').on(table.householdId, table.active)],
);

export const choreTemplates = sqliteTable(
  'chore_templates',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    title: text('title').notNull(),
    instructions: text('instructions'),
    assignmentType: text('assignment_type').$type<'ASSIGNED' | 'GENERAL'>().notNull(),
    assignedChildId: text('assigned_child_id'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    approvalMode: text('approval_mode').$type<'PARENT_APPROVAL' | 'AUTO_APPROVE'>().notNull(),
    recurrenceJson: text('recurrence_json').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('templates_household_active').on(table.householdId, table.active)],
);

export const choreInstances = sqliteTable(
  'chore_instances',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id'),
    householdId: text('household_id').notNull(),
    occurrenceKey: text('occurrence_key').notNull(),
    assignedChildId: text('assigned_child_id'),
    claimedByChildId: text('claimed_by_child_id'),
    titleSnapshot: text('title_snapshot').notNull(),
    instructionsSnapshot: text('instructions_snapshot'),
    amountMinorSnapshot: integer('amount_minor_snapshot').notNull(),
    currencySnapshot: text('currency_snapshot').notNull(),
    approvalModeSnapshot: text('approval_mode_snapshot').notNull(),
    assignmentTypeSnapshot: text('assignment_type_snapshot').notNull(),
    status: text('status').notNull(),
    availableAt: text('available_at').notNull(),
    dueAt: text('due_at'),
    expiresAt: text('expires_at'),
    completedAt: text('completed_at'),
    reviewedAt: text('reviewed_at'),
    reviewerId: text('reviewer_id'),
    returnReason: text('return_reason'),
    completionNote: text('completion_note'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('instances_template_occurrence').on(table.templateId, table.occurrenceKey),
    index('instances_household_status_time').on(table.householdId, table.status, table.availableAt),
  ],
);

export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    childId: text('child_id').notNull(),
    choreInstanceId: text('chore_instance_id'),
    type: text('type').$type<'EARNING' | 'PAYOUT' | 'ADJUSTMENT' | 'REVERSAL'>().notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    reason: text('reason').notNull(),
    createdByParentId: text('created_by_parent_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('ledger_child_time').on(table.householdId, table.childId, table.createdAt)],
);

export const savingsGoals = sqliteTable(
  'savings_goals',
  {
    id: text('id').primaryKey(),
    childId: text('child_id').notNull(),
    name: text('name').notNull(),
    targetMinor: integer('target_minor').notNull(),
    iconKey: text('icon_key').notNull(),
    encouragement: text('encouragement'),
    displayOrder: integer('display_order').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('goals_child_active_order').on(table.childId, table.active, table.displayOrder)],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadataJson: text('metadata_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('audit_household_time').on(table.householdId, table.createdAt)],
);
