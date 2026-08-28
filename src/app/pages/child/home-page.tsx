import { Banknote, CheckCircle2, ClipboardCheck, Flag, Hand, Target } from 'lucide-react';
import { Link } from 'react-router';
import type { Chore, Goal, Household, LedgerEntry } from '@/app/types';
import { ChildChoreActions } from '@/components/child-chore-actions';
import { ChoreCard } from '@/components/chore-card';
import { Money } from '@/components/money';
import { EmptyState, InlineNotice, LoadingBlock } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';

interface ChildHomeData {
  household: Household;
  actor: { id: string; displayName: string };
  balanceMinor: number;
  chores: { mine: Chore[]; board: Chore[] };
  ledger: LedgerEntry[];
  goals: Goal[];
}

export default function ChildHomePage() {
  const { data, error, loading, reload } = useApiResource<ChildHomeData>('/child/home');
  if (loading && !data) return <LoadingBlock label="Opening your home…" />;
  if (!data) return <InlineNotice tone="error">{error ?? 'Your home could not be loaded.'}</InlineNotice>;
  const { household } = data;
  const toDo = data.chores.mine.filter((chore) => ['AVAILABLE', 'CLAIMED', 'RETURNED_TO_CHILD'].includes(chore.status));
  const waiting = data.chores.mine.filter((chore) => chore.status === 'COMPLETED_PENDING_REVIEW');
  const recentlyFinished = data.chores.mine.filter((chore) => chore.status === 'APPROVED').slice(0, 3);
  const spotlight = data.goals.find((goal) => goal.active && goal.spotlight) ?? data.goals.find((goal) => goal.active);
  return <div>{error ? <InlineNotice tone="error">{error}</InlineNotice> : null}<section className="child-balance"><div><span>In your piggy bank</span><strong><Money amountMinor={data.balanceMinor} currency={household.currency} locale={household.locale} /></strong><Link to="/child/piggy-bank">See what you’ve earned</Link></div><Banknote aria-hidden="true" /></section>
    <section className="child-section"><div className="child-section-heading"><div><h1>My chores</h1><p>A short list of what’s ready for you.</p></div><Link to="/child/chores">See all</Link></div><div className="child-chore-list">{toDo.slice(0, 4).map((chore) => <ChoreCard key={chore.id} chore={chore} locale={household.locale} action={<ChildChoreActions chore={chore} releaseEnabled={household.settings.childReleaseEnabled} onChanged={reload} />} />)}{toDo.length === 0 ? <EmptyState icon={<ClipboardCheck />} title="Nothing to do right now">When a chore is ready, it will appear here.</EmptyState> : null}</div>
      {waiting.length ? <div className="waiting-band"><CheckCircle2 /><span><strong>Waiting to be checked</strong><small>{waiting.length} {waiting.length === 1 ? 'chore' : 'chores'} finished</small></span><Link to="/child/chores">View</Link></div> : null}
      {recentlyFinished.length ? <div className="finished-strip"><h2>Finished</h2>{recentlyFinished.map((chore) => <div key={chore.id}><CheckCircle2 /><span>{chore.title}</span><strong><Money amountMinor={chore.amountMinor} currency={household.currency} locale={household.locale} /></strong></div>)}</div> : null}
    </section>
    <section className="child-section"><div className="child-section-heading"><div><h2>Chore Board</h2><p>Choose only if you want to take it on.</p></div><Hand /></div><div className="child-chore-list">{data.chores.board.map((chore) => <ChoreCard key={chore.id} chore={chore} locale={household.locale} action={<ChildChoreActions chore={chore} releaseEnabled={household.settings.childReleaseEnabled} onChanged={reload} />} />)}{data.chores.board.length === 0 ? <EmptyState icon={<Hand />} title="The board is clear">A parent may add optional household jobs later.</EmptyState> : null}</div></section>
    {household.settings.savingsGoalsEnabled ? <section className="child-section"><div className="child-section-heading"><div><h2>Goals</h2><p>Your piggy-bank balance counts towards every goal.</p></div><Link to="/child/goals">All goals</Link></div>{spotlight ? <Link className="spotlight-goal" to="/child/goals"><div className="goal-icon"><Target /></div><div><span>Spotlight goal</span><h3>{spotlight.name}</h3><div className="progress-track"><span style={{ width: `${spotlight.progressPercent}%` }} /></div><p><Money amountMinor={spotlight.progressMinor} currency={household.currency} locale={household.locale} /> of <Money amountMinor={spotlight.targetMinor} currency={household.currency} locale={household.locale} /></p></div><strong>{spotlight.progressPercent}%</strong></Link> : <EmptyState icon={<Flag />} title="No goals yet">A parent can add a goal whenever you have something in mind.</EmptyState>}</section> : null}
  </div>;
}
