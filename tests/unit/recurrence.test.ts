import { describe, expect, it } from 'vitest';
import { addLocalDays, localDateTimeToUtc, materializeHorizon, recurrenceOccursOn } from '@/server/domain/recurrence';

describe('recurrence materialisation', () => {
  it('implements every N local calendar days without dates before start', () => {
    const rule = { kind: 'DAILY' as const, interval: 3, startDate: '2026-08-28', availableTime: '08:00', dueTime: null, expiryTime: '20:00' };
    expect(recurrenceOccursOn(rule, '2026-08-27')).toBe(false);
    expect(recurrenceOccursOn(rule, '2026-08-28')).toBe(true);
    expect(recurrenceOccursOn(rule, '2026-08-30')).toBe(false);
    expect(recurrenceOccursOn(rule, '2026-08-31')).toBe(true);
  });

  it('implements selected weekdays in every Nth local week', () => {
    const rule = { kind: 'WEEKLY' as const, interval: 2, weekdays: [1, 5], startDate: '2026-08-26', availableTime: '09:00', dueTime: null, expiryTime: null };
    expect(recurrenceOccursOn(rule, '2026-08-28')).toBe(true);
    expect(recurrenceOccursOn(rule, '2026-08-31')).toBe(false);
    expect(recurrenceOccursOn(rule, '2026-09-07')).toBe(true);
  });

  it('materialises only today plus the following 14 days in the household zone', () => {
    const now = new Date('2026-08-28T06:30:00.000Z');
    const rule = { kind: 'DAILY' as const, interval: 1, startDate: '2026-08-28', availableTime: '08:00', dueTime: '18:00', expiryTime: '20:00' };
    const occurrences = materializeHorizon(rule, 'Europe/London', now);
    expect(occurrences).toHaveLength(15);
    expect(occurrences[0]?.occurrenceKey).toBe('2026-08-28');
    expect(occurrences.at(-1)?.occurrenceKey).toBe(addLocalDays('2026-08-28', 14));
    expect(occurrences[0]?.availableAt).toBe('2026-08-28T07:00:00.000Z');
  });

  it('handles daylight-saving offsets with UTC materialised timestamps', () => {
    expect(localDateTimeToUtc('2026-01-15', '08:00', 'Europe/London').toISOString()).toBe('2026-01-15T08:00:00.000Z');
    expect(localDateTimeToUtc('2026-07-15', '08:00', 'Europe/London').toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });
});
