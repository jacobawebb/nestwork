export function formatMoney(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(amountMinor / 100);
}

export function parseMoneyToMinor(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fractional = ''] = normalized.split('.');
  const result = Number(whole) * 100 + Number(fractional.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}

export function calculateBalance(entries: Array<{ amountMinor: number }>): number {
  return entries.reduce((total, entry) => total + entry.amountMinor, 0);
}
