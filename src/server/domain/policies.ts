import type { Actor, ParentActor } from '../types';

export type ChoreStatus =
  | 'SCHEDULED'
  | 'AVAILABLE'
  | 'CLAIMED'
  | 'COMPLETED_PENDING_REVIEW'
  | 'RETURNED_TO_CHILD'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export function isParent(actor: Actor): actor is ParentActor {
  return actor.type === 'OWNER' || actor.type === 'PARENT';
}

export function isOwner(actor: Actor): actor is ParentActor & { type: 'OWNER' } {
  return actor.type === 'OWNER';
}

export function canChildActOn(instance: {
  assignedChildId: string | null;
  claimedByChildId: string | null;
  status: ChoreStatus;
}, childId: string): boolean {
  const belongsToChild = instance.assignedChildId === childId || instance.claimedByChildId === childId;
  return belongsToChild && ['AVAILABLE', 'CLAIMED', 'RETURNED_TO_CHILD'].includes(instance.status);
}

export function shouldExpire(status: ChoreStatus, expiresAt: string | null, now: Date): boolean {
  return Boolean(
    expiresAt &&
      new Date(expiresAt).getTime() <= now.getTime() &&
      ['SCHEDULED', 'AVAILABLE', 'CLAIMED', 'RETURNED_TO_CHILD'].includes(status),
  );
}

export function ledgerBalance(entries: Array<{ amountMinor: number }>): number {
  return entries.reduce((balance, entry) => balance + entry.amountMinor, 0);
}

export function validateLedgerMutation(
  type: 'PAYOUT' | 'ADJUSTMENT' | 'REVERSAL',
  amountMinor: number,
  availableBalance: number,
  confirmNegative: boolean,
): { ok: true; signedAmount: number } | { ok: false; reason: string } {
  if (type === 'PAYOUT') {
    if (amountMinor <= 0) return { ok: false, reason: 'Payout must be greater than zero.' };
    if (amountMinor > availableBalance) {
      return { ok: false, reason: 'A payout cannot exceed the available balance.' };
    }
    return { ok: true, signedAmount: -amountMinor };
  }
  if (amountMinor === 0) return { ok: false, reason: 'The amount cannot be zero.' };
  if (availableBalance + amountMinor < 0 && !confirmNegative) {
    return { ok: false, reason: 'Confirm the negative balance and record a reason.' };
  }
  return { ok: true, signedAmount: amountMinor };
}

export function isSessionAlive(idleExpiresAt: string, now: Date): boolean {
  return new Date(idleExpiresAt).getTime() > now.getTime();
}
