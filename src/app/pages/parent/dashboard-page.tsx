import { Banknote, ClipboardCheck, ClipboardPlus, Hand, Plus, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { ChildSummary, Chore, Household } from '@/app/types';
import { Avatar } from '@/components/avatar';
import { ChoreCard } from '@/components/chore-card';
import { EmptyState, InlineNotice, LoadingBlock } from '@/components/ui';
import { Money } from '@/components/money';
import { ReviewControls } from '@/components/review-controls';
import { useApiResource } from '@/hooks/use-api-resource';

interface DashboardData {
  household: Household;
  actor: { id: string; displayName: string; role: 'OWNER' | 'PARENT' };
  needsReview: Chore[];
  open: Chore[];
  board: Chore[];
  children: ChildSummary[];
  activity: Array<{ id: string; actorName: string; action: string; createdAt: string }>;
}

const actionLabels: Record<string, string> = {
  HOUSEHOLD_SETUP_COMPLETED: 'finished household setup', PARENT_LOGIN: 'signed in', CHILD_CREATED: 'added a child',
  CHORE_TEMPLATE_CREATED: 'created a chore', CHORE_CLAIMED: 'claimed a chore', CHORE_COMPLETED: 'finished a chore',
  CHORE_APPROVED: 'approved a chore', CHORE_RETURNED: 'returned a chore', CHORE_REJECTED: 'did not approve a chore',
  LEDGER_PAYOUT_CREATED: 'recorded a payout', LEDGER_ADJUSTMENT_CREATED: 'recorded an adjustment', SAVINGS_GOAL_CREATED: 'created a goal',
};

export default function ParentDashboard() {
  const { data, error, loading, reload } = useApiResource<DashboardData>('/parent/dashboard');
  if (loading && !data) return <LoadingBlock label="Loading parent dashboard…" />;
  if (error && !data) return <InlineNotice tone="error">{error}</InlineNotice>;
  if (!data) return null;
  const { household } = data;
  return <div>
    <header className="page-heading"><div><h1>Parent dashboard</h1><p>Keep today calm and clear. Reviews come first; everything else can wait.</p></div><div className="page-actions"><Link className="button button-secondary button-md" to="/parent/people"><Users size={18} />Add child</Link><Link className="button button-primary button-md" to="/parent/chores?new=assigned"><Plus size={18} />Add chore</Link></div></header>
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    <div className="dashboard-layout">
      <section className="section-panel needs-review-panel"><div className="section-heading"><div><h2>Needs review</h2><p>{data.needsReview.length ? `${data.needsReview.length} ${data.needsReview.length === 1 ? 'chore is' : 'chores are'} ready to check.` : 'Nothing is waiting right now.'}</p></div></div><div className="section-body chore-list">
        {data.needsReview.length ? data.needsReview.map((chore) => <ChoreCard key={chore.id} chore={chore} locale={household.locale} action={<ReviewControls choreId={chore.id} onChanged={reload} allowReturnToBoard={chore.assignmentType === 'GENERAL'} />} />) : <EmptyState icon={<ClipboardCheck />} title="All checked">Completed chores will appear here for a calm, one-at-a-time review.</EmptyState>}
      </div></section>
      <section className="section-panel today-panel"><div className="section-heading"><h2>Today</h2><Link to="/parent/chores">View all</Link></div><div className="section-body compact-list">{data.open.slice(0, 5).map((chore) => <ChoreCard compact key={chore.id} chore={chore} locale={household.locale} />)}{data.open.length === 0 ? <EmptyState icon={<ClipboardPlus />} title="No open chores">Create an assigned chore or add one to the Chore Board.</EmptyState> : null}</div></section>
      <section className="section-panel board-panel"><div className="section-heading"><h2>Chore Board</h2><Link to="/parent/chores?new=general">Add general chore</Link></div><div className="section-body mini-rows">{data.board.slice(0, 6).map((chore) => <div className="mini-row" key={chore.id}><Hand size={18} /><span><strong>{chore.title}</strong><small>{chore.childName ? `Claimed by ${chore.childName}` : 'Open to eligible children'}</small></span><Money amountMinor={chore.amountMinor} currency={household.currency} locale={household.locale} /></div>)}{data.board.length === 0 ? <p className="muted-copy">No general chores are open.</p> : null}</div></section>
      <section className="section-panel banks-panel"><div className="section-heading"><h2>Piggy banks</h2><Link to="/parent/piggy-banks">View ledger</Link></div><div className="section-body mini-rows">{data.children.map((child) => <div className="mini-row" key={child.id}><Avatar avatarKey={child.avatarKey} accentKey={child.accentKey} size="sm" /><span><strong>{child.displayName}</strong><small>Available balance</small></span><strong><Money amountMinor={child.balanceMinor} currency={household.currency} locale={household.locale} /></strong></div>)}{data.children.length === 0 ? <p className="muted-copy">Add a child to start a piggy bank.</p> : null}</div></section>
      <section className="section-panel activity-panel"><div className="section-heading"><h2>Recent activity</h2></div><ol className="activity-list">{data.activity.map((item) => <li key={item.id}><span className="activity-dot" /><div><strong>{item.actorName}</strong> {actionLabels[item.action] ?? item.action.toLowerCase().replaceAll('_', ' ')}<time dateTime={item.createdAt}>{new Intl.DateTimeFormat(household.locale, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: household.timeZone }).format(new Date(item.createdAt))}</time></div></li>)}{data.activity.length === 0 ? <li className="muted-copy">Activity appears here after household actions.</li> : null}</ol></section>
      <section className="quick-actions"><Link to="/parent/chores?new=assigned"><ClipboardPlus /><span><strong>Add assigned chore</strong><small>Choose a child and value</small></span></Link><Link to="/parent/chores?new=general"><Hand /><span><strong>Add general chore</strong><small>Publish to the board</small></span></Link><Link to="/parent/piggy-banks?payout=1"><Banknote /><span><strong>Record payout</strong><small>Cash or transfer given</small></span></Link></section>
    </div>
  </div>;
}
