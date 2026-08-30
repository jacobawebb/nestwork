import { z } from 'zod';
import { accentKeys } from './theme';

export const parentPassword = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128)
  .regex(/[a-z]/, 'Add a lowercase letter.')
  .regex(/[A-Z]/, 'Add an uppercase letter.')
  .regex(/[0-9]/, 'Add a number.');

export const childPin = z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits.');
export const email = z.string().trim().toLowerCase().email().max(254);
export const displayName = z.string().trim().min(1).max(50);
export const moneyMinor = z.number().int().min(0).max(100_000_000);
export const accentKey = z.enum(accentKeys);
export const profileAppearanceSchema = z.object({
  avatarKey: z.string().min(1).max(30),
  accentKey,
});

export const childInputSchema = profileAppearanceSchema.extend({
  id: z.string().optional(),
  displayName,
  pin: childPin.optional(),
});

export const invitationInputSchema = z.object({ email });

export const setupSchema = z.object({
  household: z.object({
    name: z.string().trim().min(1).max(80),
    locale: z.string().min(2).max(35),
    timeZone: z.string().min(1).max(80),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  owner: z.object({
    displayName,
    email,
    password: parentPassword,
    avatarKey: profileAppearanceSchema.shape.avatarKey.default('grownup-1'),
    accentKey: accentKey.default('teal'),
  }),
  children: z.array(childInputSchema.extend({ pin: childPin })).max(12),
  invitations: z.array(invitationInputSchema).max(6),
  settings: z.object({
    defaultApprovalMode: z.enum(['PARENT_APPROVAL', 'AUTO_APPROVE']),
    childReleaseEnabled: z.boolean(),
    childBoardLimit: z.number().int().min(1).max(20).default(5),
    savingsGoalsEnabled: z.boolean(),
  }),
});

export const recurrenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ONCE'),
    startDate: z.string().date(),
    availableTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    expiryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  }),
  z.object({
    kind: z.literal('DAILY'),
    interval: z.number().int().min(1).max(365),
    startDate: z.string().date(),
    availableTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    expiryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  }),
  z.object({
    kind: z.literal('WEEKLY'),
    interval: z.number().int().min(1).max(52),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1),
    startDate: z.string().date(),
    availableTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    expiryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  }),
]);

export type Recurrence = z.infer<typeof recurrenceSchema>;

export const choreTemplateInputSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    instructions: z.string().trim().max(280).nullable().optional(),
    assignmentType: z.enum(['ASSIGNED', 'GENERAL']),
    assignedChildIds: z.array(z.string().uuid()).max(20).default([]),
    eligibleChildIds: z.array(z.string().uuid()).max(20).default([]),
    amountMinor: moneyMinor,
    approvalMode: z.enum(['PARENT_APPROVAL', 'AUTO_APPROVE']),
    recurrence: recurrenceSchema,
    saveTemplate: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.assignmentType === 'ASSIGNED' && value.assignedChildIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['assignedChildIds'], message: 'Choose at least one child.' });
    }
    if (value.assignmentType === 'GENERAL' && value.assignedChildIds.length) {
      ctx.addIssue({ code: 'custom', path: ['assignedChildIds'], message: 'General chores cannot have assignees.' });
    }
  });

export const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'RETURN']),
  reason: z.string().trim().max(240).optional(),
});

export const ledgerMutationSchema = z
  .object({
    childId: z.string().uuid(),
    type: z.enum(['PAYOUT', 'ADJUSTMENT', 'REVERSAL']),
    amountMinor: z.number().int().min(-100_000_000).max(100_000_000),
    reason: z.string().trim().min(2).max(240),
    confirmNegative: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'PAYOUT' && value.amountMinor <= 0) {
      ctx.addIssue({ code: 'custom', path: ['amountMinor'], message: 'Payout must be positive.' });
    }
    if (value.type === 'ADJUSTMENT' && value.amountMinor === 0) {
      ctx.addIssue({ code: 'custom', path: ['amountMinor'], message: 'Adjustment cannot be zero.' });
    }
  });

export const goalInputSchema = z.object({
  childId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  targetMinor: z.number().int().positive().max(100_000_000),
  iconKey: z.string().min(1).max(30),
  encouragement: z.string().trim().max(160).nullable().optional(),
  displayOrder: z.number().int().min(0).max(1000).default(0),
});
