import { ClipboardCheck, Hand } from 'lucide-react';
import type { Chore, Household } from '@/app/types';
import { ChildChoreActions } from '@/components/child-chore-actions';
import { ChoreCard } from '@/components/chore-card';
import { EmptyState, InlineNotice, LoadingBlock } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';

interface ChildChoresData { mine: Chore[]; board: Chore[] }
interface ContextData { household: Household }

export default function ChildChoresPage() {
  const chores = useApiResource<ChildChoresData>('/child/chores');
  const context = useApiResource<ContextData>('/context');
  if ((chores.loading && !chores.data) || (context.loading && !context.data)) return <LoadingBlock label="Loading chores…" />;
  if (!chores.data || !context.data) return <InlineNotice tone="error">{chores.error ?? context.error ?? 'Chores could not be loaded.'}</InlineNotice>;
  const { household } = context.data;
  const groups = [
    { label: 'To do', statuses: ['AVAILABLE', 'CLAIMED', 'RETURNED_TO_CHILD'] },
    { label: 'Waiting to be checked', statuses: ['COMPLETED_PENDING_REVIEW'] },
    { label: 'Finished', statuses: ['APPROVED', 'REJECTED', 'EXPIRED'] },
  ];
  return <div><header className="child-page-heading"><h1>My chores</h1><p>Everything is grouped so you know what happens next.</p></header>{chores.error || context.error ? <InlineNotice tone="error">{chores.error ?? context.error}</InlineNotice> : null}{groups.map((group) => { const items = chores.data!.mine.filter((chore) => group.statuses.includes(chore.status)); return <section className="child-section" key={group.label}><div className="child-section-heading"><h2>{group.label}</h2><span className="count-circle">{items.length}</span></div><div className="child-chore-list">{items.map((chore) => <ChoreCard key={chore.id} chore={chore} locale={household.locale} action={<ChildChoreActions chore={chore} releaseEnabled={household.settings.childReleaseEnabled} onChanged={chores.reload} />} />)}{items.length === 0 ? <p className="calm-empty">Nothing here right now.</p> : null}</div></section>; })}<section className="child-section"><div className="child-section-heading"><div><h2>Chore Board</h2><p>Optional jobs available to pick up.</p></div><Hand /></div><div className="child-chore-list">{chores.data.board.map((chore) => <ChoreCard key={chore.id} chore={chore} locale={household.locale} action={<ChildChoreActions chore={chore} releaseEnabled={household.settings.childReleaseEnabled} onChanged={chores.reload} />} />)}{chores.data.board.length === 0 ? <EmptyState icon={<ClipboardCheck />} title="No optional chores">The board is clear.</EmptyState> : null}</div></section></div>;
}
