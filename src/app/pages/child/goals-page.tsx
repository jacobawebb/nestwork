import { CheckCircle2, Flag, Target } from 'lucide-react';
import type { Goal, Household } from '@/app/types';
import { Money } from '@/components/money';
import { Button, EmptyState, InlineNotice, LoadingBlock } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';
import { postJson } from '@/lib/api-client';

interface ContextData { household: Household }

export default function ChildGoalsPage() {
  const goals = useApiResource<Goal[]>('/child/goals');
  const context = useApiResource<ContextData>('/context');
  if ((goals.loading && !goals.data) || (context.loading && !context.data)) return <LoadingBlock label="Loading goals…" />;
  if (!goals.data || !context.data) return <InlineNotice tone="error">{goals.error ?? context.error ?? 'Goals could not be loaded.'}</InlineNotice>;
  const { household } = context.data;
  if (!household.settings.savingsGoalsEnabled) return <InlineNotice tone="info">Savings goals are currently turned off for this household.</InlineNotice>;
  const active = goals.data.filter((goal) => goal.active);
  const spotlight = active.find((goal) => goal.spotlight);
  const choose = async (goalId: string) => { try { await postJson('/child/goals/spotlight', { goalId }, 'PUT'); await goals.reload(); } catch { /* Session boundary handles auth; keep the current selection on a transient failure. */ } };
  return <div><header className="child-page-heading"><h1>My goals</h1><p>The same piggy-bank balance shows progress on every goal. No money is moved or held aside.</p></header>{goals.error || context.error ? <InlineNotice tone="error">{goals.error ?? context.error}</InlineNotice> : null}{spotlight?.reached ? <div className="goal-reached"><CheckCircle2 /><div><strong>You reached “{spotlight.name}”</strong><span>Your money stays in your piggy bank until a parent records a payout.</span></div></div> : null}<div className="child-goal-list">{active.map((goal) => <article className={goal.spotlight ? 'child-goal child-goal-spotlight' : 'child-goal'} key={goal.id}><div className="goal-icon"><Target /></div><div className="child-goal-copy"><div><h2>{goal.name}</h2>{goal.spotlight ? <span>Spotlight</span> : null}</div>{goal.encouragement ? <p>{goal.encouragement}</p> : null}<div className="progress-track"><span style={{ width: `${goal.progressPercent}%` }} /></div><small><Money amountMinor={goal.progressMinor} currency={household.currency} locale={household.locale} /> of <Money amountMinor={goal.targetMinor} currency={household.currency} locale={household.locale} /> · {goal.progressPercent}%</small></div>{!goal.spotlight ? <Button variant="secondary" onClick={() => void choose(goal.id)}>Make spotlight</Button> : null}</article>)}{active.length === 0 ? <EmptyState icon={<Flag />} title="No goals yet">A parent can add goals from the piggy-bank view.</EmptyState> : null}</div></div>;
}
