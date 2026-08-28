import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router';
import type { Profile, Session } from '@/app/types';
import { Avatar } from '@/components/avatar';
import { Button, Field, InlineNotice, LoadingBlock, Modal, TextInput } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useApiResource } from '@/hooks/use-api-resource';
import { postJson } from '@/lib/api-client';

interface ProfileResponse {
  initialized: boolean;
  householdName?: string;
  profiles: Profile[];
}

export default function SelectorPage() {
  const { session, checking, authenticate } = useSession();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApiResource<ProfileResponse>(checking ? null : '/profiles');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [credential, setCredential] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    navigate(session.actor.type === 'PARENT' ? '/parent' : '/child', { replace: true });
  }, [navigate, session]);

  if (checking || loading || session) return <LoadingBlock label="Opening profile selection…" />;
  if (data && !data.initialized) return <Navigate to="/setup" replace />;

  const choose = (profile: Profile) => {
    setSelected(profile);
    setEmail('');
    setCredential('');
    setFormError(null);
  };

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = selected.type === 'PARENT'
        ? await postJson<{ session: Session }>('/login/parent', { profileId: selected.id, email, password: credential })
        : await postJson<{ session: Session }>('/login/child', { profileId: selected.id, pin: credential });
      authenticate(result.session);
      navigate(selected.type === 'PARENT' ? '/parent' : '/child', { replace: true });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Sign-in was not accepted.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="selector-page">
      <div className="selector-brand" aria-hidden="true"><ShieldCheck /></div>
      <header className="selector-heading">
        <h1>Who’s using the app?</h1>
        <p>Choose your profile to continue.</p>
      </header>
      {error ? <InlineNotice tone="error">{error} <Button variant="quiet" size="sm" onClick={() => void reload()}>Try again</Button></InlineNotice> : null}
      <div className="profile-grid" aria-label={`${data?.householdName ?? 'Household'} profiles`}>
        {data?.profiles.map((profile) => (
          <button key={profile.id} type="button" className="profile-card" onClick={() => choose(profile)}>
            <Avatar avatarKey={profile.avatarKey} accentKey={profile.accentKey} size="lg" />
            <strong>{profile.displayName}</strong>
            <span>{profile.label}</span>
          </button>
        ))}
      </div>
      {!error && data?.profiles.length === 0 ? <InlineNotice tone="warning">No active profiles are available. The owner can reactivate a profile from Settings.</InlineNotice> : null}
      <p className="selector-privacy"><LockKeyhole size={16} />Nothing private is shown until a profile is unlocked.</p>

      {selected ? (
        <Modal title={`Unlock ${selected.displayName}`} onClose={() => setSelected(null)}>
          <form className="form-stack" onSubmit={signIn}>
            <div className="selected-profile"><Avatar avatarKey={selected.avatarKey} accentKey={selected.accentKey} /><div><strong>{selected.displayName}</strong><span>{selected.label}</span></div></div>
            {selected.type === 'PARENT' ? (
              <Field label="Email address"><TextInput type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></Field>
            ) : null}
            <Field label={selected.type === 'PARENT' ? 'Password' : 'PIN'} hint={selected.type === 'CHILD' ? 'Enter 4–6 numbers.' : undefined}>
              <TextInput
                type="password"
                inputMode={selected.type === 'CHILD' ? 'numeric' : undefined}
                pattern={selected.type === 'CHILD' ? '[0-9]{4,6}' : undefined}
                autoComplete={selected.type === 'PARENT' ? 'current-password' : 'off'}
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                required
                autoFocus={selected.type === 'CHILD'}
              />
            </Field>
            {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
            <Button type="submit" size="lg" disabled={submitting}>{submitting ? 'Checking…' : 'Continue'}</Button>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}
