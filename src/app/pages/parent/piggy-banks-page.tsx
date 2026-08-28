import { useEffect, useState, type FormEvent } from 'react';
import { Banknote, Flag, History, Plus, SlidersHorizontal, Target } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { ChildSummary, Goal, Household, LedgerEntry } from '@/app/types';
import { Avatar } from '@/components/avatar';
import { Money } from '@/components/money';
import { Button, EmptyState, Field, InlineNotice, LoadingBlock, Modal, Select, TextArea, TextInput } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';
import { parseMoneyToMinor } from '@/lib/money';
import { postJson } from '@/lib/api-client';

interface DashboardData { household: Household; children: ChildSummary[] }

function LedgerForm({ child, balanceMinor, mode, onClose, onSaved }: { child: ChildSummary; balanceMinor: number; mode: 'PAYOUT' | 'ADJUSTMENT' | 'REVERSAL'; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('Cash');
  const [confirmNegative, setConfirmNegative] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const absolute = parseMoneyToMinor(amount.replace('-', ''));
    if (absolute === null || absolute === 0) { setError('Enter a valid non-zero amount.'); return; }
    const signed = mode === 'PAYOUT' ? absolute : amount.trim().startsWith('-') ? -absolute : absolute;
    setBusy(true); setError(null);
    try { await postJson('/parent/ledger', { childId: child.id, type: mode, amountMinor: signed, reason: mode === 'PAYOUT' ? `${method}: ${reason}` : reason, confirmNegative }); await onSaved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The ledger entry could not be recorded.'); }
    finally { setBusy(false); }
  };
  return <form className="form-stack" onSubmit={save}><InlineNotice tone="info">Available now: <strong>{balanceMinor / 100}</strong> in household currency. Ledger entries cannot be edited or deleted.</InlineNotice>{mode === 'PAYOUT' ? <Field label="How was it given?"><Select value={method} onChange={(event) => setMethod(event.target.value)}><option>Cash</option><option>Bank transfer</option><option>Other</option></Select></Field> : null}<Field label={mode === 'PAYOUT' ? 'Payout amount' : 'Signed amount'} hint={mode === 'PAYOUT' ? 'Cannot exceed the available balance.' : 'Use a minus sign to reduce the balance.'}><TextInput inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={mode === 'PAYOUT' ? '0.00' : '-0.00 or 0.00'} required autoFocus /></Field><Field label="Reason"><TextArea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} required /></Field>{mode !== 'PAYOUT' ? <label className="toggle-row"><input type="checkbox" checked={confirmNegative} onChange={(event) => setConfirmNegative(event.target.checked)} /><span><strong>Allow this correction to make the balance negative</strong><small>Only select this deliberately; the reason is recorded in the audit trail.</small></span></label> : null}{error ? <InlineNotice tone="error">{error}</InlineNotice> : null}<div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Recording…' : 'Record entry'}</Button></div></form>;
}

function GoalForm({ childId, goal, onClose, onSaved }: { childId: string; goal?: Goal | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? (goal.targetMinor / 100).toFixed(2) : '');
  const [iconKey, setIconKey] = useState(goal?.iconKey ?? 'target');
  const [encouragement, setEncouragement] = useState(goal?.encouragement ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault(); const targetMinor = parseMoneyToMinor(target);
    if (!targetMinor) { setError('Enter a target greater than zero.'); return; }
    setBusy(true); setError(null);
    try { const value = { childId, name, targetMinor, iconKey, encouragement: encouragement || null, displayOrder: goal?.displayOrder ?? 0 }; if (goal) await postJson(`/parent/goals/${goal.id}`, value, 'PATCH'); else await postJson('/parent/goals', value); await onSaved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The goal could not be saved.'); }
    finally { setBusy(false); }
  };
  return <form className="form-stack" onSubmit={save}><Field label="Goal name"><TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required autoFocus /></Field><div className="form-grid"><Field label="Target amount"><TextInput inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} required /></Field><Field label="Built-in icon"><Select value={iconKey} onChange={(event) => setIconKey(event.target.value)}><option value="target">Target</option><option value="outing">Outing</option><option value="game">Game</option><option value="toy">Toy</option><option value="save">Saving</option></Select></Field></div><Field label="Encouragement (optional)"><TextArea value={encouragement ?? ''} onChange={(event) => setEncouragement(event.target.value)} maxLength={160} /></Field>{error ? <InlineNotice tone="error">{error}</InlineNotice> : null}<div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : goal ? 'Save goal' : 'Create goal'}</Button></div></form>;
}

export default function PiggyBanksPage() {
  const [search, setSearch] = useSearchParams();
  const dashboard = useApiResource<DashboardData>('/parent/dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (!selectedId && dashboard.data?.children[0]) setSelectedId(dashboard.data.children[0].id); }, [dashboard.data, selectedId]);
  const ledger = useApiResource<LedgerEntry[]>(selectedId ? `/parent/ledger?childId=${encodeURIComponent(selectedId)}` : null);
  const goals = useApiResource<Goal[]>(selectedId ? `/parent/goals/${selectedId}` : null);
  const [ledgerMode, setLedgerMode] = useState<'PAYOUT' | 'ADJUSTMENT' | 'REVERSAL' | null>(null);
  const [goalEditor, setGoalEditor] = useState<Goal | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const child = dashboard.data?.children.find((item) => item.id === selectedId) ?? null;
  const household = dashboard.data?.household;

  useEffect(() => { if (search.get('payout') === '1' && child) setLedgerMode('PAYOUT'); }, [child, search]);
  const closeLedger = () => { setLedgerMode(null); if (search.has('payout')) { search.delete('payout'); setSearch(search, { replace: true }); } };
  const reloadDetails = async () => { await Promise.all([dashboard.reload(), ledger.reload(), goals.reload()]); closeLedger(); setGoalEditor(null); };
  const archiveGoal = async (goal: Goal) => { try { await postJson(`/parent/goals/${goal.id}`, { active: false }, 'PATCH'); await goals.reload(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Goal could not be archived.'); } };

  if (dashboard.loading && !dashboard.data) return <LoadingBlock label="Loading piggy banks…" />;
  return <div><header className="page-heading"><div><h1>Piggy banks</h1><p>Balances are calculated from an append-only ledger. The app records real-world money; it never transfers funds.</p></div>{child ? <div className="page-actions"><Button variant="secondary" onClick={() => setLedgerMode('ADJUSTMENT')}><SlidersHorizontal size={18} />Adjustment</Button><Button onClick={() => setLedgerMode('PAYOUT')}><Banknote size={18} />Record payout</Button></div> : null}</header>
    {dashboard.error || ledger.error || goals.error || error ? <InlineNotice tone="error">{dashboard.error ?? ledger.error ?? goals.error ?? error}</InlineNotice> : null}
    {dashboard.data?.children.length === 0 ? <EmptyState icon={<Banknote />} title="No piggy banks yet">Add a child profile first. A balance starts at zero and changes only through real ledger entries.</EmptyState> : <div className="bank-layout"><aside className="child-picker" aria-label="Choose child">{dashboard.data?.children.map((item) => <button key={item.id} type="button" aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id)}><Avatar avatarKey={item.avatarKey} accentKey={item.accentKey} size="sm" /><span>{item.displayName}</span></button>)}</aside>{child && household ? <div className="bank-content">
      <section className="balance-hero"><div><span>Available balance</span><strong><Money amountMinor={child.balanceMinor} currency={household.currency} locale={household.locale} /></strong><small>Earned <Money amountMinor={child.earnedMinor} currency={household.currency} locale={household.locale} /> · Paid out <Money amountMinor={child.paidMinor} currency={household.currency} locale={household.locale} /></small></div><Banknote aria-hidden="true" /></section>
      <div className="bank-columns"><section className="section-panel"><div className="section-heading"><div><h2>Savings goals</h2><p>Every goal uses the same available balance; money is not reserved.</p></div><Button variant="secondary" size="sm" onClick={() => setGoalEditor('new')}><Plus size={16} />Goal</Button></div><div className="section-body goal-list">{goals.loading && !goals.data ? <LoadingBlock /> : goals.data?.filter((goal) => goal.active).map((goal) => <article className="goal-row" key={goal.id}><div className="goal-icon"><Target /></div><div><div className="goal-title"><h3>{goal.name}</h3><span>{goal.progressPercent}%</span></div><div className="progress-track"><span style={{ width: `${goal.progressPercent}%` }} /></div><p><Money amountMinor={goal.progressMinor} currency={household.currency} locale={household.locale} /> of <Money amountMinor={goal.targetMinor} currency={household.currency} locale={household.locale} />{goal.spotlight ? ' · Spotlight' : ''}</p></div><div className="goal-actions"><Button variant="quiet" size="sm" onClick={() => setGoalEditor(goal)}>Edit</Button><Button variant="quiet" size="sm" onClick={() => void archiveGoal(goal)}>Archive</Button></div></article>)}{goals.data?.filter((goal) => goal.active).length === 0 ? <EmptyState icon={<Flag />} title="No active goals">Add a milestone without moving or reserving any money.</EmptyState> : null}</div></section>
        <section className="section-panel"><div className="section-heading"><div><h2>Ledger history</h2><p>Corrections are new entries; history stays intact.</p></div><Button variant="quiet" size="sm" onClick={() => setLedgerMode('REVERSAL')}><History size={16} />Reversal</Button></div><div className="ledger-list">{ledger.loading && !ledger.data ? <LoadingBlock /> : ledger.data?.map((entry) => <div className="ledger-row" key={entry.id}><span className={`ledger-type ledger-type-${entry.type.toLowerCase()}`}>{entry.type}</span><div><strong>{entry.reason}</strong><small>{new Intl.DateTimeFormat(household.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: household.timeZone }).format(new Date(entry.createdAt))}</small></div><strong className={entry.amountMinor >= 0 ? 'amount-positive' : 'amount-negative'}><Money sign amountMinor={entry.amountMinor} currency={entry.currency} locale={household.locale} /></strong></div>)}{ledger.data?.length === 0 ? <EmptyState icon={<History />} title="No ledger entries">Approved chores, payouts, and corrections will appear here.</EmptyState> : null}</div></section>
      </div>
    </div> : null}</div>}
    {child && ledgerMode ? <Modal title={ledgerMode === 'PAYOUT' ? `Record payout for ${child.displayName}` : ledgerMode === 'ADJUSTMENT' ? `Adjust ${child.displayName}’s balance` : `Record a reversal for ${child.displayName}`} onClose={closeLedger}><LedgerForm child={child} balanceMinor={child.balanceMinor} mode={ledgerMode} onClose={closeLedger} onSaved={reloadDetails} /></Modal> : null}
    {child && goalEditor ? <Modal title={goalEditor === 'new' ? `Add a goal for ${child.displayName}` : `Edit ${goalEditor.name}`} onClose={() => setGoalEditor(null)}><GoalForm childId={child.id} goal={goalEditor === 'new' ? null : goalEditor} onClose={() => setGoalEditor(null)} onSaved={reloadDetails} /></Modal> : null}
  </div>;
}
