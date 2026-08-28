import { useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { postJson } from '@/lib/api-client';
import { Button, Field, InlineNotice, Modal, TextArea } from './ui';

export function ReviewControls({ choreId, onChanged, allowReturnToBoard = false }: { choreId: string; onChanged: () => void | Promise<void>; allowReturnToBoard?: boolean }) {
  const [action, setAction] = useState<'REJECT' | 'RETURN' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = async (nextAction: 'APPROVE' | 'REJECT' | 'RETURN') => {
    setBusy(true); setError(null);
    try {
      await postJson(`/parent/chores/${choreId}/review`, { action: nextAction, reason: reason || undefined });
      setAction(null); setReason(''); await onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Review could not be saved.'); }
    finally { setBusy(false); }
  };

  const returnBoard = async () => {
    setBusy(true); setError(null);
    try { await postJson(`/parent/chores/${choreId}/return-to-board`, {}); await onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The chore could not be returned.'); }
    finally { setBusy(false); }
  };

  return <>
    <div className="review-controls">
      <Button size="sm" onClick={() => void review('APPROVE')} disabled={busy}><Check size={16} />Approve</Button>
      <Button variant="secondary" size="sm" onClick={() => setAction('RETURN')} disabled={busy}><RotateCcw size={16} />Try again</Button>
      <Button variant="quiet" size="sm" onClick={() => setAction('REJECT')} disabled={busy}><X size={16} />Reject</Button>
      {allowReturnToBoard ? <Button variant="secondary" size="sm" onClick={() => void returnBoard()} disabled={busy}>Return to board</Button> : null}
    </div>
    {error && !action ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    {action ? <Modal title={action === 'RETURN' ? 'Send this back for another try' : 'Do not approve this chore'} onClose={() => setAction(null)}>
      <div className="form-stack"><Field label="Kind explanation"><TextArea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} autoFocus /></Field>{error ? <InlineNotice tone="error">{error}</InlineNotice> : null}<div className="modal-actions"><Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button><Button onClick={() => void review(action)} disabled={busy || reason.trim().length < 2}>{busy ? 'Saving…' : action === 'RETURN' ? 'Send back' : 'Reject chore'}</Button></div></div>
    </Modal> : null}
  </>;
}
