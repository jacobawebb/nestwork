import { Banknote, History } from 'lucide-react';
import type { Household, LedgerEntry } from '@/app/types';
import { Money } from '@/components/money';
import { EmptyState, InlineNotice, LoadingBlock } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';

interface LedgerData { balanceMinor: number; entries: LedgerEntry[] }
interface ContextData { household: Household }

export default function ChildPiggyPage() {
  const ledger = useApiResource<LedgerData>('/child/ledger');
  const context = useApiResource<ContextData>('/context');
  if ((ledger.loading && !ledger.data) || (context.loading && !context.data)) return <LoadingBlock label="Opening your piggy bank…" />;
  if (!ledger.data || !context.data) return <InlineNotice tone="error">{ledger.error ?? context.error ?? 'Piggy bank could not be loaded.'}</InlineNotice>;
  const { household } = context.data;
  const earned = ledger.data.entries.filter((entry) => entry.type === 'EARNING').reduce((sum, entry) => sum + entry.amountMinor, 0);
  const given = Math.abs(ledger.data.entries.filter((entry) => entry.type === 'PAYOUT').reduce((sum, entry) => sum + entry.amountMinor, 0));
  return <div><header className="child-page-heading"><h1>My piggy bank</h1><p>A clear record of what you earned and what has been given to you.</p></header><section className="child-balance child-balance-large"><div><span>In your piggy bank</span><strong><Money amountMinor={ledger.data.balanceMinor} currency={household.currency} locale={household.locale} /></strong><small>Earned <Money amountMinor={earned} currency={household.currency} locale={household.locale} /> · Given to you <Money amountMinor={given} currency={household.currency} locale={household.locale} /></small></div><Banknote /></section><section className="child-section"><div className="child-section-heading"><h2>History</h2><History /></div><div className="ledger-list child-ledger">{ledger.data.entries.map((entry) => <div className="ledger-row" key={entry.id}><span className={`ledger-type ledger-type-${entry.type.toLowerCase()}`}>{entry.type === 'EARNING' ? 'Earned' : entry.type === 'PAYOUT' ? 'Given' : 'Correction'}</span><div><strong>{entry.reason}</strong><small>{new Intl.DateTimeFormat(household.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: household.timeZone }).format(new Date(entry.createdAt))}</small></div><strong className={entry.amountMinor >= 0 ? 'amount-positive' : 'amount-negative'}><Money sign amountMinor={entry.amountMinor} currency={entry.currency} locale={household.locale} /></strong></div>)}{ledger.data.entries.length === 0 ? <EmptyState icon={<History />} title="No history yet">Approved chores and payouts will appear here.</EmptyState> : null}</div></section></div>;
}
