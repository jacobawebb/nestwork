import { useState } from 'react';
import { Check, Hand, LogOut } from 'lucide-react';
import type { Chore } from '@/app/types';
import { postJson } from '@/lib/api-client';
import { Button, Field, InlineNotice, Modal, TextArea } from './ui';

export function ChildChoreActions({ chore, releaseEnabled, onChanged }: { chore: Chore; releaseEnabled: boolean; onChanged: () => void | Promise<void> }) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (path: string, body: unknown = {}) => {
    setBusy(true); setError(null);
    try { await postJson(path, body); setCompleteOpen(false); setNote(''); await onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The chore could not be updated.'); }
    finally { setBusy(false); }
  };
  if (chore.status === 'AVAILABLE' && chore.assignmentType === 'GENERAL' && !chore.assignedChildId) return <><Button size="lg" onClick={() => void act(`/child/chores/${chore.id}/claim`)} disabled={busy}><Hand size={19} />{busy ? 'Claiming…' : 'I’ll do this'}</Button>{error ? <InlineNotice tone="error">{error}</InlineNotice> : null}</>;
  if (['AVAILABLE', 'CLAIMED', 'RETURNED_TO_CHILD'].includes(chore.status)) return <><div className="child-action-stack"><Button size="lg" onClick={() => setCompleteOpen(true)}><Check size={20} />I’ve done it</Button>{releaseEnabled && chore.assignmentType === 'GENERAL' && chore.status === 'CLAIMED' ? <Button variant="quiet" size="sm" onClick={() => void act(`/child/chores/${chore.id}/release`)} disabled={busy}><LogOut size={16} />Release back to board</Button> : null}</div>{error && !completeOpen ? <InlineNotice tone="error">{error}</InlineNotice> : null}{completeOpen ? <Modal title={`Finished “${chore.title}”?`} onClose={() => setCompleteOpen(false)}><div className="form-stack"><p>Confirm once. {chore.approvalMode === 'AUTO_APPROVE' ? 'This chore credits your piggy bank straight away.' : 'A parent will check it before money is added.'}</p><Field label="Optional note"><TextArea value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} placeholder="Anything you want the parent to know" /></Field>{error ? <InlineNotice tone="error">{error}</InlineNotice> : null}<div className="modal-actions"><Button variant="secondary" onClick={() => setCompleteOpen(false)}>Not yet</Button><Button onClick={() => void act(`/child/chores/${chore.id}/complete`, { note: note || null })} disabled={busy}>{busy ? 'Saving…' : 'Yes, I’ve done it'}</Button></div></div></Modal> : null}</>;
  return null;
}
