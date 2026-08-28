import { describe, expect, it } from 'vitest';
import { canChildActOn, isSessionAlive, ledgerBalance, shouldExpire, validateLedgerMutation } from '@/server/domain/policies';

describe('domain policies', () => {
  it('scopes child actions to their own assigned or claimed chore', () => {
    expect(canChildActOn({ assignedChildId: 'a', claimedByChildId: null, status: 'AVAILABLE' }, 'a')).toBe(true);
    expect(canChildActOn({ assignedChildId: 'a', claimedByChildId: null, status: 'AVAILABLE' }, 'b')).toBe(false);
    expect(canChildActOn({ assignedChildId: null, claimedByChildId: 'a', status: 'RETURNED_TO_CHILD' }, 'a')).toBe(true);
    expect(canChildActOn({ assignedChildId: 'a', claimedByChildId: null, status: 'APPROVED' }, 'a')).toBe(false);
  });

  it('derives balances and guards payouts/negative corrections', () => {
    expect(ledgerBalance([{ amountMinor: 500 }, { amountMinor: -200 }, { amountMinor: 50 }])).toBe(350);
    expect(validateLedgerMutation('PAYOUT', 400, 350, false)).toEqual({ ok: false, reason: 'A payout cannot exceed the available balance.' });
    expect(validateLedgerMutation('PAYOUT', 300, 350, false)).toEqual({ ok: true, signedAmount: -300 });
    expect(validateLedgerMutation('ADJUSTMENT', -400, 350, false).ok).toBe(false);
    expect(validateLedgerMutation('ADJUSTMENT', -400, 350, true)).toEqual({ ok: true, signedAmount: -400 });
  });

  it('expires only unfinished states and rejects the exact idle boundary', () => {
    const now = new Date('2026-08-28T12:00:10.000Z');
    expect(shouldExpire('AVAILABLE', '2026-08-28T12:00:10.000Z', now)).toBe(true);
    expect(shouldExpire('APPROVED', '2026-08-28T12:00:00.000Z', now)).toBe(false);
    expect(isSessionAlive('2026-08-28T12:00:10.001Z', now)).toBe(true);
    expect(isSessionAlive('2026-08-28T12:00:10.000Z', now)).toBe(false);
  });
});
