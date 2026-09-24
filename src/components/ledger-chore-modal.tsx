import type { Chore } from '@/app/types';
import { ChoreCard } from '@/components/chore-card';
import { Button, InlineNotice, LoadingBlock, Modal } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';

export function LedgerChoreModal({ choreId, viewer, locale, onClose }: { choreId: string; viewer: 'parent' | 'child'; locale: string; onClose: () => void }) {
  const detail = useApiResource<Chore>(`/${viewer}/chores/${encodeURIComponent(choreId)}`);
  const chore = detail.data?.id === choreId ? detail.data : null;

  return <Modal title="View chore" onClose={onClose}>
    {detail.loading && !chore ? <LoadingBlock label="Loading chore…" /> : null}
    {detail.error ? <InlineNotice tone="error">{detail.error}</InlineNotice> : null}
    {chore ? <ChoreCard chore={chore} locale={locale} showDescription /> : null}
    <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Close</Button></div>
  </Modal>;
}
