import { formatMoney } from '@/lib/money';

export function Money({ amountMinor, currency, locale, sign = false }: { amountMinor: number; currency: string; locale: string; sign?: boolean }) {
  const formatted = formatMoney(Math.abs(amountMinor), currency, locale);
  const prefix = sign ? (amountMinor > 0 ? '+' : amountMinor < 0 ? '−' : '') : amountMinor < 0 ? '−' : '';
  return <>{prefix}{formatted}</>;
}
