import { useState, type FormEvent } from 'react';
import { Archive, Copy, Edit3, KeyRound, Plus, UserRoundPlus, Users } from 'lucide-react';
import { Avatar, avatarOptions, ColourPicker } from '@/components/avatar';
import { Button, EmptyState, Field, InlineNotice, LoadingBlock, Modal, Select, TextInput } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useApiResource } from '@/hooks/use-api-resource';
import { postJson } from '@/lib/api-client';

interface ParentPerson { id: string; displayName: string; email: string; role: 'OWNER' | 'PARENT'; avatarKey: string; accentKey: string; active: boolean }
interface ChildPerson { id: string; displayName: string; avatarKey: string; accentKey: string; active: boolean }
interface Invitation { id: string; email: string; expiresAt: string; acceptedAt: string | null }
interface PeopleData { parents: ParentPerson[]; children: ChildPerson[]; invitations: Invitation[] }

function ChildEditor({ child, onClose, onSaved }: { child?: ChildPerson | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [displayName, setDisplayName] = useState(child?.displayName ?? '');
  const [avatarKey, setAvatarKey] = useState(child?.avatarKey ?? 'child-1');
  const [accentKey, setAccentKey] = useState(child?.accentKey ?? 'teal');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if ((!child || pin) && !/^\d{4,6}$/.test(pin)) { setError('PIN must contain 4–6 numbers.'); return; }
    setBusy(true); setError(null);
    try {
      const value = { displayName, avatarKey, accentKey, ...(pin ? { pin } : {}) };
      if (child) await postJson(`/parent/children/${child.id}`, value, 'PATCH');
      else await postJson('/parent/children', { ...value, pin });
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The child profile could not be saved.'); }
    finally { setBusy(false); }
  };
  return <form className="form-stack" data-theme={accentKey} onSubmit={save}><div className="avatar-preview"><Avatar avatarKey={avatarKey} accentKey={accentKey} size="lg" /></div><Field label="Display name"><TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} required autoFocus /></Field><div className="form-grid"><Field label="Avatar"><Select value={avatarKey} onChange={(event) => setAvatarKey(event.target.value)}>{avatarOptions.filter((option) => option.key.startsWith('child')).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</Select></Field><ColourPicker value={accentKey} onChange={setAccentKey} label="Colour theme" /></div><Field label={child ? 'New PIN (optional)' : 'PIN'} hint={child ? 'Leave empty to keep the current PIN. Changing it locks active child sessions.' : 'Use 4–6 numbers.'}><TextInput type="password" inputMode="numeric" pattern="[0-9]{4,6}" value={pin} onChange={(event) => setPin(event.target.value)} required={!child} /></Field>{error ? <InlineNotice tone="error">{error}</InlineNotice> : null}<div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : child ? 'Save profile' : 'Add child'}</Button></div></form>;
}

export default function PeoplePage() {
  const { session } = useSession();
  const { data, error, loading, reload } = useApiResource<PeopleData>('/parent/people');
  const [editing, setEditing] = useState<ChildPerson | null | 'new'>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = session?.actor.role === 'OWNER';

  if (loading && !data) return <LoadingBlock label="Loading people…" />;
  const toggleChild = async (child: ChildPerson) => { try { await postJson(`/parent/children/${child.id}/active`, { active: !child.active }); await reload(); } catch (caught) { setFormError(caught instanceof Error ? caught.message : 'Profile could not be updated.'); } };
  const toggleParent = async (parent: ParentPerson) => { try { await postJson(`/parent/adults/${parent.id}/active`, { active: !parent.active }); await reload(); } catch (caught) { setFormError(caught instanceof Error ? caught.message : 'Adult account could not be updated.'); } };
  const invite = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setFormError(null);
    try { const result = await postJson<{ token: string }>('/parent/invitations', { email: inviteEmail }); setInviteLink(`${window.location.origin}/invite/${result.token}`); await reload(); }
    catch (caught) { setFormError(caught instanceof Error ? caught.message : 'Invitation could not be created.'); }
    finally { setBusy(false); }
  };

  return <div><header className="page-heading"><div><h1>People & permissions</h1><p>Parents manage chores and money. Only the owner manages adult accounts and household-wide settings.</p></div><div className="page-actions">{owner ? <Button variant="secondary" onClick={() => setInviteOpen(true)}><UserRoundPlus size={18} />Invite adult</Button> : null}<Button onClick={() => setEditing('new')}><Plus size={18} />Add child</Button></div></header>
    {error || formError ? <InlineNotice tone="error">{error ?? formError}</InlineNotice> : null}
    <div className="people-layout"><section className="section-panel"><div className="section-heading"><h2>Children</h2></div><div className="people-list">{data?.children.map((child) => <article className="person-row" key={child.id}><Avatar avatarKey={child.avatarKey} accentKey={child.accentKey} /><div><h3>{child.displayName}</h3><p>{child.active ? 'Active child profile' : 'Archived child profile'}</p></div><span className={child.active ? 'template-active' : 'template-archived'}>{child.active ? 'Active' : 'Archived'}</span><div className="person-actions"><Button variant="quiet" size="sm" onClick={() => setEditing(child)}><Edit3 size={16} />Edit / PIN</Button><Button variant="quiet" size="sm" onClick={() => void toggleChild(child)}><Archive size={16} />{child.active ? 'Archive' : 'Reactivate'}</Button></div></article>)}{data?.children.length === 0 ? <div className="section-body"><EmptyState icon={<Users />} title="No child profiles yet">Add a child when they are ready to use the household board.</EmptyState></div> : null}</div></section>
      <section className="section-panel"><div className="section-heading"><h2>Adults</h2></div><div className="people-list">{data?.parents.map((parent) => <article className="person-row" key={parent.id}><Avatar avatarKey={parent.avatarKey} accentKey={parent.accentKey} /><div><h3>{parent.displayName}</h3><p>{parent.email} · {parent.role === 'OWNER' ? 'Owner' : 'Parent'}</p></div><span className={parent.active ? 'template-active' : 'template-archived'}>{parent.active ? 'Active' : 'Inactive'}</span>{owner && parent.role === 'PARENT' ? <div className="person-actions"><Button variant="quiet" size="sm" onClick={() => void toggleParent(parent)}><Archive size={16} />{parent.active ? 'Deactivate' : 'Reactivate'}</Button></div> : null}</article>)}</div>{!owner ? <div className="section-body"><InlineNotice tone="info">Only the household owner can invite or manage other adults.</InlineNotice></div> : null}</section>
      {owner ? <section className="section-panel invitations-panel"><div className="section-heading"><h2>Invitation history</h2></div><div className="people-list">{data?.invitations.map((invitation) => <div className="invitation-row" key={invitation.id}><KeyRound /><span><strong>{invitation.email}</strong><small>{invitation.acceptedAt ? 'Accepted' : new Date(invitation.expiresAt) > new Date() ? `Expires ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(invitation.expiresAt))}` : 'Expired'}</small></span></div>)}{data?.invitations.length === 0 ? <p className="section-body muted-copy">No invitations have been created.</p> : null}</div></section> : null}
    </div>
    {editing ? <Modal title={editing === 'new' ? 'Add child' : `Edit ${editing.displayName}`} onClose={() => setEditing(null)}><ChildEditor child={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} /></Modal> : null}
    {inviteOpen ? <Modal title="Invite another parent or guardian" onClose={() => { setInviteOpen(false); setInviteLink(null); }}><form className="form-stack" onSubmit={invite}>{inviteLink ? <><InlineNotice tone="success">The single-use link is ready. It expires in seven days.</InlineNotice><div className="copy-row"><span>{inviteLink}</span><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(inviteLink)}><Copy size={16} />Copy</Button></div><Button onClick={() => { setInviteOpen(false); setInviteLink(null); }}>Done</Button></> : <><Field label="Adult email"><TextInput type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required autoFocus /></Field><p className="muted-copy">No email is sent. Copy the link and share it privately.</p>{formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}<div className="modal-actions"><Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create link'}</Button></div></>}</form></Modal> : null}
  </div>;
}
