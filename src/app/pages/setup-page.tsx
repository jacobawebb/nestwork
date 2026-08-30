import { useMemo, useState, type FormEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router';
import type { Session } from '@/app/types';
import { accentOptions, Avatar, avatarOptions, ColourPicker } from '@/components/avatar';
import { Button, Field, InlineNotice, LoadingBlock, Select, TextInput } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useApiResource } from '@/hooks/use-api-resource';
import { postJson } from '@/lib/api-client';

interface ChildDraft { id: string; displayName: string; avatarKey: string; accentKey: string; pin: string }
interface InvitationDraft { id: string; email: string }
interface CompletedSetup { session: Session; invitations: Array<{ email: string; token: string }> }

const stepNames = ['Household', 'Owner', 'People', 'Defaults', 'Review'];
const currencies = ['GBP', 'EUR', 'USD', 'AUD', 'CAD', 'NZD', 'JPY'];

function browserDefaults() {
  const locale = navigator.language || 'en-GB';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
  const region = locale.split('-')[1]?.toUpperCase();
  const currency = region === 'US' ? 'USD' : region === 'AU' ? 'AUD' : region === 'CA' ? 'CAD' : region === 'NZ' ? 'NZD' : region === 'JP' ? 'JPY' : region && ['FR', 'DE', 'IE', 'ES', 'IT', 'NL', 'BE', 'PT', 'AT'].includes(region) ? 'EUR' : 'GBP';
  return { locale, timeZone, currency };
}

export default function SetupPage() {
  const navigate = useNavigate();
  const { session, authenticate } = useSession();
  const { data: status, loading } = useApiResource<{ initialized: boolean }>('/bootstrap/status');
  const defaults = useMemo(browserDefaults, []);
  const [unlocked, setUnlocked] = useState(false);
  const [secret, setSecret] = useState('');
  const [step, setStep] = useState(0);
  const [household, setHousehold] = useState({ name: '', locale: defaults.locale, timeZone: defaults.timeZone, currency: defaults.currency });
  const [owner, setOwner] = useState({ displayName: '', email: '', password: '', avatarKey: 'grownup-1', accentKey: 'teal' });
  const [children, setChildren] = useState<ChildDraft[]>([]);
  const [invitations, setInvitations] = useState<InvitationDraft[]>([]);
  const [settings, setSettings] = useState<{ defaultApprovalMode: 'PARENT_APPROVAL' | 'AUTO_APPROVE'; childReleaseEnabled: boolean; childBoardLimit: number; savingsGoalsEnabled: boolean }>({ defaultApprovalMode: 'PARENT_APPROVAL', childReleaseEnabled: false, childBoardLimit: 5, savingsGoalsEnabled: true });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<CompletedSetup | null>(null);
  const timeZones = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone'); } catch { return [defaults.timeZone]; }
  }, [defaults.timeZone]);

  if (loading) return <LoadingBlock label="Checking installation…" />;
  if (status?.initialized && !completed) return <Navigate to={session?.actor.type === 'PARENT' ? '/parent' : '/'} replace />;

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      await postJson('/bootstrap/unlock', { secret });
      setSecret('');
      setUnlocked(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Setup could not be unlocked.'); }
    finally { setBusy(false); }
  };

  const addChild = () => setChildren((current) => [...current, { id: crypto.randomUUID(), displayName: '', avatarKey: 'child-1', accentKey: accentOptions[current.length % accentOptions.length]!, pin: '' }]);
  const addInvitation = () => setInvitations((current) => [...current, { id: crypto.randomUUID(), email: '' }]);

  const stepValid = () => {
    if (step === 0) return Boolean(household.name.trim() && household.locale && household.timeZone && household.currency);
    if (step === 1) return Boolean(owner.displayName.trim() && /^\S+@\S+\.\S+$/.test(owner.email) && owner.password.length >= 12 && /[A-Z]/.test(owner.password) && /[a-z]/.test(owner.password) && /\d/.test(owner.password));
    if (step === 2) return children.every((child) => child.displayName.trim() && /^\d{4,6}$/.test(child.pin)) && invitations.every((invitation) => /^\S+@\S+\.\S+$/.test(invitation.email));
    return true;
  };

  const next = () => {
    if (!stepValid()) { setError('Complete the required fields before continuing.'); return; }
    setError(null); setStep((current) => Math.min(stepNames.length - 1, current + 1));
  };

  const finish = async () => {
    setBusy(true); setError(null);
    try {
      const result = await postJson<CompletedSetup>('/bootstrap/complete', {
        household,
        owner,
        children: children.map(({ id: _id, ...child }) => child),
        invitations: invitations.map(({ id: _id, ...invitation }) => invitation),
        settings,
      });
      authenticate(result.session);
      setCompleted(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Setup could not be completed. Nothing was partially saved.'); }
    finally { setBusy(false); }
  };

  if (!unlocked) {
    return (
      <main className="setup-unlock">
        <div className="setup-unlock-card">
          <div className="selector-brand"><ShieldCheck /></div>
          <h1>Set up your household</h1>
          <p>Use the private setup secret configured with this deployment. The secret is checked securely and is never shown by the app.</p>
          <form className="form-stack" onSubmit={unlock}>
            <Field label="Setup secret"><TextInput type="password" autoComplete="off" value={secret} onChange={(event) => setSecret(event.target.value)} required autoFocus /></Field>
            {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
            <Button type="submit" size="lg" disabled={busy}>{busy ? 'Checking…' : 'Unlock setup'}</Button>
          </form>
        </div>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="setup-page" data-theme={owner.accentKey}><section className="setup-complete">
        <div className="complete-mark"><Check /></div><h1>Your household is ready</h1>
        <p>The owner account is signed in. The shared-device lock will activate after 30 seconds without activity.</p>
        {completed.invitations.length ? <div className="invitation-results"><h2>Copy invitation links</h2><p>Each link works once and expires after seven days.</p>{completed.invitations.map((invitation) => {
          const link = `${window.location.origin}/invite/${invitation.token}`;
          return <div className="copy-row" key={invitation.email}><div><strong>{invitation.email}</strong><span>{link}</span></div><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(link)}><Copy size={17} />Copy</Button></div>;
        })}</div> : null}
        <Button size="lg" onClick={() => navigate('/parent', { replace: true })}>Enter parent dashboard<ChevronRight size={19} /></Button>
      </section></main>
    );
  }

  return (
    <main className="setup-page" data-theme={owner.accentKey}>
      <div className="setup-shell">
        <ol className="setup-progress" aria-label="Setup progress">{stepNames.map((name, index) => <li key={name} className={index <= step ? 'setup-progress-active' : ''} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span><small>{name}</small></li>)}</ol>
        <section className="setup-content">
          {step === 0 ? <><h1>Set up your household</h1><p className="lead">Start with the basics. You can change these later in owner settings.</p><div className="form-grid">
            <Field label="Household name"><TextInput value={household.name} onChange={(event) => setHousehold({ ...household, name: event.target.value })} placeholder="Your family name or home" autoFocus /></Field>
            <Field label="Locale"><TextInput value={household.locale} onChange={(event) => setHousehold({ ...household, locale: event.target.value })} /></Field>
            <Field label="Time zone"><Select value={household.timeZone} onChange={(event) => setHousehold({ ...household, timeZone: event.target.value })}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</Select></Field>
            <Field label="Currency"><Select value={household.currency} onChange={(event) => setHousehold({ ...household, currency: event.target.value })}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</Select></Field>
          </div></> : null}

          {step === 1 ? <><h1>Who is the owner?</h1><p className="lead">The owner alone manages household settings, adult accounts, and invitations.</p><div className="form-grid">
            <div className="appearance-choice" data-theme={owner.accentKey}><Avatar avatarKey={owner.avatarKey} accentKey={owner.accentKey} size="lg" label={`${owner.displayName || 'Owner'} avatar preview`} /><ColourPicker value={owner.accentKey} onChange={(accentKey) => setOwner({ ...owner, accentKey })} label="Owner colour theme" /></div>
            <Field label="Display name"><TextInput value={owner.displayName} onChange={(event) => setOwner({ ...owner, displayName: event.target.value })} autoFocus /></Field>
            <Field label="Email address"><TextInput type="email" autoComplete="username" value={owner.email} onChange={(event) => setOwner({ ...owner, email: event.target.value })} /></Field>
            <Field label="Password" hint="At least 12 characters with uppercase, lowercase, and a number."><TextInput type="password" autoComplete="new-password" value={owner.password} onChange={(event) => setOwner({ ...owner, password: event.target.value })} /></Field>
            <Field label="Avatar"><Select value={owner.avatarKey} onChange={(event) => setOwner({ ...owner, avatarKey: event.target.value })}>{avatarOptions.filter((option) => option.key.startsWith('grownup')).map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</Select></Field>
          </div></> : null}

          {step === 2 ? <><div className="setup-section-heading"><div><h1>Add people</h1><p className="lead">Children unlock with a short PIN. Other adults receive a private, single-use link.</p></div></div>
            <div className="people-builder"><div className="builder-heading"><h2>Children</h2><Button variant="secondary" onClick={addChild}><Plus size={18} />Add child</Button></div>
              {children.length === 0 ? <p className="builder-empty">No children added yet. This is optional during setup.</p> : children.map((child, index) => <div className="person-draft" data-theme={child.accentKey} key={child.id}><Avatar avatarKey={child.avatarKey} accentKey={child.accentKey} />
                <Field label={`Child ${index + 1} name`}><TextInput value={child.displayName} onChange={(event) => setChildren((current) => current.map((item) => item.id === child.id ? { ...item, displayName: event.target.value } : item))} /></Field>
                <Field label="PIN"><TextInput type="password" inputMode="numeric" pattern="[0-9]{4,6}" value={child.pin} onChange={(event) => setChildren((current) => current.map((item) => item.id === child.id ? { ...item, pin: event.target.value } : item))} /></Field>
                <Field label="Avatar"><Select value={child.avatarKey} onChange={(event) => setChildren((current) => current.map((item) => item.id === child.id ? { ...item, avatarKey: event.target.value } : item))}>{avatarOptions.filter((option) => option.key.startsWith('child')).map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</Select></Field>
                <Button variant="quiet" aria-label={`Remove ${child.displayName || `child ${index + 1}`}`} onClick={() => setChildren((current) => current.filter((item) => item.id !== child.id))}><Trash2 size={18} /></Button>
                <ColourPicker className="person-colour" compact value={child.accentKey} onChange={(accentKey) => setChildren((current) => current.map((item) => item.id === child.id ? { ...item, accentKey } : item))} label={`Child ${index + 1} colour theme`} />
              </div>)}</div>
            <div className="people-builder"><div className="builder-heading"><h2>Additional adults</h2><Button variant="secondary" onClick={addInvitation}><Plus size={18} />Invite adult</Button></div>
              {invitations.length === 0 ? <p className="builder-empty">No adult invitations added. You can invite someone later.</p> : invitations.map((invitation, index) => <div className="invite-draft" key={invitation.id}><Field label={`Adult ${index + 1} email`}><TextInput type="email" value={invitation.email} onChange={(event) => setInvitations((current) => current.map((item) => item.id === invitation.id ? { ...item, email: event.target.value } : item))} /></Field><Button variant="quiet" aria-label="Remove invitation" onClick={() => setInvitations((current) => current.filter((item) => item.id !== invitation.id))}><Trash2 size={18} /></Button></div>)}</div>
          </> : null}

          {step === 3 ? <><h1>Choose household defaults</h1><p className="lead">These choices guide new chores and the child Chore Board.</p><div className="form-stack">
            <Field label="Default chore approval"><Select value={settings.defaultApprovalMode} onChange={(event) => setSettings({ ...settings, defaultApprovalMode: event.target.value as 'PARENT_APPROVAL' | 'AUTO_APPROVE' })}><option value="PARENT_APPROVAL">A parent checks each chore</option><option value="AUTO_APPROVE">Credit when marked done</option></Select></Field>
            <Field label="Chore Board limit" hint="How many currently available general chores each child sees."><TextInput type="number" min={1} max={20} value={settings.childBoardLimit} onChange={(event) => setSettings({ ...settings, childBoardLimit: Number(event.target.value) })} /></Field>
            <label className="toggle-row"><input type="checkbox" checked={settings.childReleaseEnabled} onChange={(event) => setSettings({ ...settings, childReleaseEnabled: event.target.checked })} /><span><strong>Allow a child to release an uncompleted general chore</strong><small>A parent can always return an eligible chore to the board.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={settings.savingsGoalsEnabled} onChange={(event) => setSettings({ ...settings, savingsGoalsEnabled: event.target.checked })} /><span><strong>Enable savings goals</strong><small>Goals show progress but never reserve or move money.</small></span></label>
          </div></> : null}

          {step === 4 ? <><h1>Review and finish</h1><p className="lead">The household, owner, defaults, and initial children are created together. If creation fails, nothing is partially saved.</p><div className="review-list">
            <div><span>Household</span><strong>{household.name}</strong><small>{household.locale} · {household.timeZone} · {household.currency}</small></div>
            <div><span>Owner</span><strong>{owner.displayName}</strong><small>{owner.email}</small></div>
            <div><span>Children</span><strong>{children.length}</strong><small>{children.map((child) => child.displayName).join(', ') || 'None yet'}</small></div>
            <div><span>Other adults</span><strong>{invitations.length}</strong><small>{invitations.length ? 'Single-use invitation links will be created' : 'None invited yet'}</small></div>
            <div><span>Approval</span><strong>{settings.defaultApprovalMode === 'PARENT_APPROVAL' ? 'Parent checks by default' : 'Auto-approve by default'}</strong><small>Board limit: {settings.childBoardLimit}</small></div>
          </div><InlineNotice tone="info">The shared-device session locks exactly 30 seconds after the last meaningful activity.</InlineNotice></> : null}

          {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
          <div className="setup-actions"><Button variant="secondary" disabled={step === 0 || busy} onClick={() => { setError(null); setStep((current) => current - 1); }}><ChevronLeft size={18} />Back</Button>{step < stepNames.length - 1 ? <Button disabled={busy} onClick={next}>Continue<ChevronRight size={18} /></Button> : <Button disabled={busy} onClick={() => void finish()}>{busy ? 'Creating household…' : 'Finish setup'}<Check size={18} /></Button>}</div>
        </section>
      </div>
    </main>
  );
}
