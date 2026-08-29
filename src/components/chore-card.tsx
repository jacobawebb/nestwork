import { ClipboardCheck, Hand, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Chore } from '@/app/types';
import { Money } from './money';
import { Status } from './status';

export function ChoreCard({ chore, locale, action, compact = false }: { chore: Chore; locale: string; action?: ReactNode; compact?: boolean }) {
  return (
    <article className={compact ? 'chore-card chore-card-compact' : 'chore-card'}>
      <div className="chore-icon" aria-hidden="true">{chore.status === 'RETURNED_TO_CHILD' ? <RotateCcw /> : chore.assignmentType === 'GENERAL' ? <Hand /> : <ClipboardCheck />}</div>
      <div className="chore-copy">
        <div className="chore-title-line"><h3>{chore.title}</h3><strong className="chore-value"><Money amountMinor={chore.amountMinor} currency={chore.currency} locale={locale} /></strong></div>
        {chore.instructions && !compact ? <p>{chore.instructions}</p> : null}
        {chore.returnReason && !compact ? <p className="chore-note chore-note-parent"><strong>Parent note:</strong> {chore.returnReason}</p> : null}
        {chore.completionNote && chore.status === 'COMPLETED_PENDING_REVIEW' && !compact ? <p className="chore-note"><strong>Child note:</strong> {chore.completionNote}</p> : null}
        <div className="chore-meta"><Status value={chore.status} />{chore.childName ? <span>For {chore.childName}</span> : null}{chore.dueAt ? <span>Due {new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(chore.dueAt))}</span> : null}</div>
      </div>
      {action ? <div className="chore-action">{action}</div> : null}
    </article>
  );
}
