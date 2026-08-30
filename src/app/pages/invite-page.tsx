import { useState, type FormEvent } from 'react';
import { CheckCircle2, UserRoundPlus } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button, Field, InlineNotice, LoadingBlock, Select, TextInput } from '@/components/ui';
import { Avatar, avatarOptions, ColourPicker } from '@/components/avatar';
import { useApiResource } from '@/hooks/use-api-resource';
import { postJson } from '@/lib/api-client';

interface Invitation { id: string; email: string; householdName: string; expiresAt: string }

export default function InvitePage() {
  const { token = '' } = useParams();
  const { data, error, loading } = useApiResource<Invitation>(token ? `/invitations/${encodeURIComponent(token)}` : null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [avatarKey, setAvatarKey] = useState('grownup-2');
  const [accentKey, setAccentKey] = useState('blue');
  const [formError, setFormError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setFormError(null);
    try { await postJson(`/invitations/${encodeURIComponent(token)}/accept`, { displayName, password, avatarKey, accentKey }); setComplete(true); }
    catch (caught) { setFormError(caught instanceof Error ? caught.message : 'The invitation could not be accepted.'); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingBlock label="Checking invitation…" />;
  return <main className="setup-unlock"><section className="setup-unlock-card">
    {complete ? <><div className="complete-mark"><CheckCircle2 /></div><h1>You’re ready to join</h1><p>Your parent account has been created. Select your profile and sign in with the email and password you just chose.</p><Button onClick={() => window.location.assign('/')}>Choose profile</Button></> : <>
      <div className="selector-brand"><UserRoundPlus /></div><h1>Join {data?.householdName ?? 'the household'}</h1>
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : data ? <form className="form-stack" data-theme={accentKey} onSubmit={accept}><p>This single-use invitation is for <strong>{data.email}</strong>.</p><Field label="Your display name"><TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} required autoFocus /></Field><Field label="Create a password" hint="At least 12 characters with uppercase, lowercase, and a number."><TextInput type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field><div className="appearance-choice"><Avatar avatarKey={avatarKey} accentKey={accentKey} size="lg" label="Your avatar preview" /><div className="form-stack"><Field label="Avatar"><Select value={avatarKey} onChange={(event) => setAvatarKey(event.target.value)}>{avatarOptions.filter((option) => option.key.startsWith('grownup')).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</Select></Field><ColourPicker value={accentKey} onChange={setAccentKey} label="Colour theme" /></div></div>{formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}<Button type="submit" size="lg" disabled={busy}>{busy ? 'Creating account…' : 'Join household'}</Button></form> : null}
      <Link className="quiet-link" to="/">Back to profile selection</Link>
    </>}
  </section></main>;
}
