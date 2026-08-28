import type { Recurrence } from '@/lib/contracts';

export interface MaterializedOccurrence {
  occurrenceKey: string;
  availableAt: string;
  dueAt: string | null;
  expiresAt: string | null;
  initialStatus: 'SCHEDULED' | 'AVAILABLE';
}

function dateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year!, month!, day!];
}

export function addLocalDays(date: string, days: number): string {
  const [year, month, day] = dateParts(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = dateParts(start);
  const [ey, em, ed] = dateParts(end);
  return Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}

export function localDateForInstant(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

// Intl gives us the offset at a guessed instant. Two passes handle DST boundaries
// without coupling the domain layer to Node-only time-zone packages.
export function localDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateParts(date);
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += desired - represented;
  }
  return new Date(guess);
}

function weekday(date: string): number {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function recurrenceOccursOn(recurrence: Recurrence, date: string): boolean {
  const delta = daysBetween(recurrence.startDate, date);
  if (delta < 0) return false;
  if (recurrence.kind === 'ONCE') return delta === 0;
  if (recurrence.kind === 'DAILY') return delta % recurrence.interval === 0;
  const startWeekday = weekday(recurrence.startDate);
  const daysFromStartWeek = delta + startWeekday;
  const weekIndex = Math.floor(daysFromStartWeek / 7);
  return weekIndex % recurrence.interval === 0 && recurrence.weekdays.includes(weekday(date));
}

export function materializeHorizon(
  recurrence: Recurrence,
  timeZone: string,
  now: Date,
  horizonDays = 14,
): MaterializedOccurrence[] {
  const today = localDateForInstant(now, timeZone);
  const occurrences: MaterializedOccurrence[] = [];
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const localDate = addLocalDays(today, offset);
    if (!recurrenceOccursOn(recurrence, localDate)) continue;
    const available = localDateTimeToUtc(localDate, recurrence.availableTime, timeZone);
    const due = recurrence.dueTime ? localDateTimeToUtc(localDate, recurrence.dueTime, timeZone) : null;
    const expiry = recurrence.expiryTime ? localDateTimeToUtc(localDate, recurrence.expiryTime, timeZone) : null;
    if (due && due <= available) due.setUTCDate(due.getUTCDate() + 1);
    if (expiry && expiry <= available) expiry.setUTCDate(expiry.getUTCDate() + 1);
    occurrences.push({
      occurrenceKey: localDate,
      availableAt: available.toISOString(),
      dueAt: due?.toISOString() ?? null,
      expiresAt: expiry?.toISOString() ?? null,
      initialStatus: available <= now ? 'AVAILABLE' : 'SCHEDULED',
    });
  }
  return occurrences;
}
