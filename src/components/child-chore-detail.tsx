import { ArrowLeft } from 'lucide-react';
import type { Chore } from '@/app/types';
import { ChoreCard } from '@/components/chore-card';

export function ChildChoreDetail({ chore, locale, onClose }: { chore: Chore; locale: string; onClose: () => void }) {
  return <section className="child-chore-detail" role="dialog" aria-modal="true" aria-label={`Chore details: ${chore.title}`}>
    <div className="child-chore-detail-shell">
      <header className="child-chore-detail-header">
        <button type="button" className="child-chore-detail-back" onClick={onClose}><ArrowLeft size={20} />Back to chores</button>
        <span>Chore details</span>
      </header>
      <div className="child-chore-detail-content">
        <ChoreCard chore={chore} locale={locale} showDescription />
      </div>
    </div>
  </section>;
}
