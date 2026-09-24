import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Delete, LockKeyhole, ShieldCheck } from 'lucide-react';
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

interface ChildPinScreenProps {
  profile: Profile;
  pin: string;
  error: string | null;
  submitting: boolean;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onBack: () => void;
  onContinue: () => void;
}

function ChildPinScreen({ profile, pin, error, submitting, onDigit, onDelete, onClear, onBack, onContinue }: ChildPinScreenProps) {
  const screenRef = useRef<HTMLElement>(null);

  useEffect(() => {
    screenRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (submitting || event.altKey || event.ctrlKey || event.metaKey) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        onDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        onDelete();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, onDelete, onDigit, submitting]);

  return (
    <section ref={screenRef} className="child-pin-screen" data-theme={profile.accentKey} role="dialog" aria-modal="true" aria-labelledby="child-pin-title" tabIndex={-1}>
      <div className="child-pin-shell">
        <div className="child-pin-topbar">
          <button type="button" className="child-pin-back" onClick={onBack} disabled={submitting} aria-label="Back to profiles"><ArrowLeft size={20} /> <span>Profiles</span></button>
          <span className="child-pin-lock"><LockKeyhole size={16} /> Child sign-in</span>
        </div>
        <div className="child-pin-content">
          <Avatar avatarKey={profile.avatarKey} accentKey={profile.accentKey} size="lg" />
          <h2 id="child-pin-title">Hi, {profile.displayName}!</h2>
          <p>Enter your PIN to get started.</p>
          <div className="child-pin-dots" role="status" aria-label={`${pin.length} of 6 PIN digits entered`}>
            {Array.from({ length: 6 }, (_, index) => <span key={index} className={index < pin.length ? 'child-pin-dot child-pin-dot-filled' : 'child-pin-dot'} aria-hidden="true" />)}
          </div>
          {error ? <InlineNotice tone="error">{error}</InlineNotice> : <span className="child-pin-hint">Your PIN is 4 to 6 numbers long.</span>}
          <div className="child-pin-keypad" aria-label="PIN keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button key={digit} type="button" className="child-pin-key" aria-label={`PIN digit ${digit}`} onClick={() => onDigit(String(digit))} disabled={submitting || pin.length === 6}>{digit}</button>
            ))}
            <button type="button" className="child-pin-key child-pin-key-action" onClick={onClear} disabled={submitting || pin.length === 0}>Clear</button>
            <button type="button" className="child-pin-key" aria-label="PIN digit 0" onClick={() => onDigit('0')} disabled={submitting || pin.length === 6}>0</button>
            <button type="button" className="child-pin-key child-pin-key-action" aria-label="Delete last PIN digit" onClick={onDelete} disabled={submitting || pin.length === 0}><Delete size={23} /></button>
          </div>
          <Button type="button" size="lg" className="child-pin-continue" onClick={onContinue} disabled={submitting || pin.length < 4}>{submitting ? 'Checking…' : 'Continue'}</Button>
        </div>
      </div>
    </section>
  );
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

  const signIn = async () => {
    if (!selected || submitting || (selected.type === 'CHILD' && !/^\d{4,6}$/.test(credential))) return;
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
      if (selected.type === 'CHILD') setCredential('');
    } finally {
      setSubmitting(false);
    }
  };

  const addPinDigit = (digit: string) => {
    setCredential((current) => current.length < 6 ? current + digit : current);
    setFormError(null);
  };

  const deletePinDigit = () => {
    setCredential((current) => current.slice(0, -1));
    setFormError(null);
  };

  const clearPin = () => {
    setCredential('');
    setFormError(null);
  };

  const backToProfiles = () => {
    setSelected(null);
    clearPin();
  };

  if (selected?.type === 'CHILD') {
    return <ChildPinScreen profile={selected} pin={credential} error={formError} submitting={submitting} onDigit={addPinDigit} onDelete={deletePinDigit} onClear={clearPin} onBack={backToProfiles} onContinue={() => void signIn()} />;
  }

  return (
    <main className="selector-page" data-theme={selected?.accentKey ?? 'teal'}>
      <div className="selector-brand" aria-hidden="true"><ShieldCheck /></div>
      <header className="selector-heading">
        <h1>Who’s using the app?</h1>
        <p>Choose your profile to continue.</p>
      </header>
      {error ? <InlineNotice tone="error">{error} <Button variant="quiet" size="sm" onClick={() => void reload()}>Try again</Button></InlineNotice> : null}
      <div className="profile-grid" aria-label={`${data?.householdName ?? 'Household'} profiles`}>
        {data?.profiles.map((profile) => (
          <button key={profile.id} type="button" className="profile-card" data-theme={profile.accentKey} onClick={() => choose(profile)}>
            <Avatar avatarKey={profile.avatarKey} accentKey={profile.accentKey} size="lg" />
            <strong>{profile.displayName}</strong>
            <span>{profile.label}</span>
          </button>
        ))}
      </div>
      {!error && data?.profiles.length === 0 ? <InlineNotice tone="warning">No active profiles are available. The owner can reactivate a profile from Settings.</InlineNotice> : null}
      <p className="selector-privacy"><LockKeyhole size={16} />Nothing private is shown until a profile is unlocked.</p>

      {selected?.type === 'PARENT' ? (
        <Modal title={`Unlock ${selected.displayName}`} onClose={backToProfiles}>
          <form className="form-stack" onSubmit={(event: FormEvent) => { event.preventDefault(); void signIn(); }}>
            <div className="selected-profile"><Avatar avatarKey={selected.avatarKey} accentKey={selected.accentKey} /><div><strong>{selected.displayName}</strong><span>{selected.label}</span></div></div>
            <Field label="Email address"><TextInput type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></Field>
            <Field label="Password">
              <TextInput
                type="password"
                autoComplete="current-password"
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                required
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
