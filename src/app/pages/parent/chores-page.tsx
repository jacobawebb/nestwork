import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, Ban, CalendarClock, ClipboardList, Edit3, Hand, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { Chore, Household } from '@/app/types';
import { ChoreCard } from '@/components/chore-card';
import { ReviewControls } from '@/components/review-controls';
import { Button, EmptyState, Field, InlineNotice, LoadingBlock, Modal, Select, TextArea, TextInput } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';
import { api, postJson } from '@/lib/api-client';
import { parseMoneyToMinor } from '@/lib/money';

interface Person { id: string; displayName: string; active: boolean }
interface PeopleData { children: Person[] }
interface Template {
  id: string; title: string; instructions: string | null; assignmentType: 'ASSIGNED' | 'GENERAL'; assignedChildIds: string[];
  eligibleChildIds: string[]; amountMinor: number; currency: string; approvalMode: 'PARENT_APPROVAL' | 'AUTO_APPROVE';
  recurrence: { kind: 'ONCE' | 'DAILY' | 'WEEKLY'; interval?: number; weekdays?: number[]; startDate: string; availableTime: string; dueTime?: string | null; expiryTime?: string | null };
  active: boolean; savedAsTemplate: boolean; instanceCount: number;
}

const weekdays = [{ value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }];

function todayLocal() { return new Date().toLocaleDateString('en-CA'); }

function ChoreForm({ children, initial, initialType, defaultApprovalMode, onSaved, onCancel }: { children: Person[]; initial?: Template | null; initialType?: 'ASSIGNED' | 'GENERAL'; defaultApprovalMode: 'PARENT_APPROVAL' | 'AUTO_APPROVE'; onSaved: () => void | Promise<void>; onCancel: () => void }) {
  const recurrence = initial?.recurrence;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [assignmentType, setAssignmentType] = useState<'ASSIGNED' | 'GENERAL'>(initial?.assignmentType ?? initialType ?? 'ASSIGNED');
  const [assignedChildIds, setAssignedChildIds] = useState<string[]>(initial?.assignedChildIds ?? []);
  const [eligibleChildIds, setEligibleChildIds] = useState<string[]>(initial?.eligibleChildIds ?? []);
  const [amount, setAmount] = useState(initial ? (initial.amountMinor / 100).toFixed(2) : '');
  const [approvalMode, setApprovalMode] = useState<'PARENT_APPROVAL' | 'AUTO_APPROVE'>(initial?.approvalMode ?? defaultApprovalMode);
  const [kind, setKind] = useState<'ONCE' | 'DAILY' | 'WEEKLY'>(recurrence?.kind ?? 'ONCE');
  const [interval, setInterval] = useState(recurrence?.interval ?? 1);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(recurrence?.weekdays ?? [new Date().getDay()]);
  const [startDate, setStartDate] = useState(recurrence?.startDate ?? todayLocal());
  const [availableTime, setAvailableTime] = useState(recurrence?.availableTime ?? '08:00');
  const [dueTime, setDueTime] = useState(recurrence?.dueTime ?? '');
  const [expiryTime, setExpiryTime] = useState(recurrence?.expiryTime ?? '');
  const [saveTemplate, setSaveTemplate] = useState(initial?.savedAsTemplate ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const amountMinor = parseMoneyToMinor(amount);
    if (amountMinor === null) { setError('Enter a valid amount with no more than two decimal places.'); return; }
    if (assignmentType === 'ASSIGNED' && !assignedChildIds.length) { setError('Choose at least one active child.'); return; }
    if (kind === 'WEEKLY' && selectedWeekdays.length === 0) { setError('Choose at least one weekday.'); return; }
    setBusy(true); setError(null);
    const rule = {
      kind,
      ...(kind === 'ONCE' ? {} : { interval }),
      ...(kind === 'WEEKLY' ? { weekdays: selectedWeekdays } : {}),
      startDate,
      availableTime,
      dueTime: dueTime || null,
      expiryTime: expiryTime || null,
    };
    try {
      const body = { title, instructions: instructions || null, assignmentType, assignedChildIds: assignmentType === 'ASSIGNED' ? assignedChildIds : [], eligibleChildIds: assignmentType === 'GENERAL' ? eligibleChildIds : [], amountMinor, approvalMode, recurrence: rule, saveTemplate };
      if (initial) await postJson(`/parent/templates/${initial.id}`, body, 'PUT');
      else await postJson('/parent/templates', body);
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The chore could not be saved.'); }
    finally { setBusy(false); }
  };

  return <form className="form-stack" onSubmit={save}>
    <div className="segmented"><button type="button" aria-pressed={assignmentType === 'ASSIGNED'} onClick={() => setAssignmentType('ASSIGNED')}>Assigned to a child</button><button type="button" aria-pressed={assignmentType === 'GENERAL'} onClick={() => setAssignmentType('GENERAL')}>Add to Chore Board</button></div>
    <div className="form-grid"><Field label="Chore title"><TextInput value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required autoFocus /></Field><Field label="Earning amount"><TextInput value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" required /></Field></div>
    <Field label="Short instructions" hint="Plain text, up to 280 characters."><TextArea value={instructions ?? ''} onChange={(event) => setInstructions(event.target.value)} maxLength={280} /></Field>
    {assignmentType === 'ASSIGNED' ? <fieldset className="choice-field"><legend>Assign to children</legend><p>Each selected child gets their own independent copy. Completing one never completes another.</p><div className="check-grid">{children.filter((child) => child.active).map((child) => <label key={child.id}><input type="checkbox" checked={assignedChildIds.includes(child.id)} onChange={(event) => setAssignedChildIds((current) => event.target.checked ? [...current, child.id] : current.filter((id) => id !== child.id))} />{child.displayName}</label>)}</div></fieldset> : <fieldset className="choice-field"><legend>Eligible children</legend><p>Leave everyone unchecked to make it available to all active children.</p><div className="check-grid">{children.filter((child) => child.active).map((child) => <label key={child.id}><input type="checkbox" checked={eligibleChildIds.includes(child.id)} onChange={(event) => setEligibleChildIds((current) => event.target.checked ? [...current, child.id] : current.filter((id) => id !== child.id))} />{child.displayName}</label>)}</div></fieldset>}
    <Field label="Approval"><Select value={approvalMode} onChange={(event) => setApprovalMode(event.target.value as 'PARENT_APPROVAL' | 'AUTO_APPROVE')}><option value="PARENT_APPROVAL">Parent checks before credit</option><option value="AUTO_APPROVE">Credit when child marks done</option></Select></Field>
    <fieldset className="choice-field"><legend>Schedule</legend><div className="form-grid"><Field label="Repeats"><Select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="ONCE">One time</option><option value="DAILY">Every N days</option><option value="WEEKLY">Weekly on selected days</option></Select></Field>{kind !== 'ONCE' ? <Field label={kind === 'DAILY' ? 'Every number of days' : 'Every number of weeks'}><TextInput type="number" min={1} max={kind === 'DAILY' ? 365 : 52} value={interval} onChange={(event) => setInterval(Number(event.target.value))} /></Field> : null}<Field label="Local start date"><TextInput type="date" min={todayLocal()} value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></Field><Field label="Available at"><TextInput type="time" value={availableTime} onChange={(event) => setAvailableTime(event.target.value)} required /></Field><Field label="Due time (optional)"><TextInput type="time" value={dueTime ?? ''} onChange={(event) => setDueTime(event.target.value)} /></Field><Field label="Expiry time (optional)"><TextInput type="time" value={expiryTime ?? ''} onChange={(event) => setExpiryTime(event.target.value)} /></Field></div>{kind === 'WEEKLY' ? <div className="weekday-grid">{weekdays.map((day) => <label key={day.value}><input type="checkbox" checked={selectedWeekdays.includes(day.value)} onChange={(event) => setSelectedWeekdays((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value))} />{day.label}</label>)}</div> : null}</fieldset>
    <label className="toggle-row"><input type="checkbox" checked={saveTemplate} onChange={(event) => setSaveTemplate(event.target.checked)} /><span><strong>Save to template library</strong><small>Keep this configuration to reuse later. It does not change any other chores.</small></span></label>
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    <div className="modal-actions"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create chore'}</Button></div>
  </form>;
}

function ParentInstanceActions({ chore, onChanged, onEdit }: { chore: Chore; onChanged: () => void | Promise<void>; onEdit: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelable = ['SCHEDULED', 'AVAILABLE', 'CLAIMED', 'RETURNED_TO_CHILD', 'COMPLETED_PENDING_REVIEW'].includes(chore.status);
  const returnable = chore.assignmentType === 'GENERAL' && ['CLAIMED', 'RETURNED_TO_CHILD'].includes(chore.status);
  const act = async (path: string) => {
    setBusy(true); setError(null);
    try { await postJson(path, {}); await onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The chore could not be updated.'); }
    finally { setBusy(false); }
  };
  if (!cancelable && !returnable && chore.status !== 'COMPLETED_PENDING_REVIEW') return null;
  return <div className="parent-instance-actions">
    {chore.status === 'COMPLETED_PENDING_REVIEW' ? <ReviewControls choreId={chore.id} onChanged={onChanged} allowReturnToBoard={chore.assignmentType === 'GENERAL'} /> : null}
    {chore.templateId ? <Button variant="quiet" size="sm" onClick={onEdit}><Edit3 size={16} />Edit</Button> : null}
    {returnable ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(`/parent/chores/${chore.id}/return-to-board`)}>Return to board</Button> : null}
    {cancelable ? <Button variant="quiet" size="sm" disabled={busy} onClick={() => void act(`/parent/chores/${chore.id}/cancel`)}><Ban size={16} />Cancel</Button> : null}
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
  </div>;
}

export default function ChoresPage() {
  const [search, setSearch] = useSearchParams();
  const instances = useApiResource<Chore[]>('/parent/chores');
  const templates = useApiResource<Template[]>('/parent/templates');
  const people = useApiResource<PeopleData>('/parent/people');
  const context = useApiResource<{ household: Household }>('/context');
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState<'ASSIGNED' | 'GENERAL' | null>(null);
  const [status, setStatus] = useState('OPEN');
  const [childId, setChildId] = useState('ALL');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mode = search.get('new');
    if (mode === 'assigned' || mode === 'general') setCreating(mode === 'assigned' ? 'ASSIGNED' : 'GENERAL');
  }, [search]);

  const closeForm = () => { setCreating(null); setEditing(null); if (search.has('new')) { search.delete('new'); setSearch(search, { replace: true }); } };
  const reloadAll = async () => { await Promise.all([instances.reload(), templates.reload()]); closeForm(); };
  const visible = useMemo(() => (instances.data ?? []).filter((chore) => {
    const statusMatch = status === 'ALL' || (status === 'OPEN' ? ['SCHEDULED', 'AVAILABLE', 'CLAIMED', 'RETURNED_TO_CHILD', 'COMPLETED_PENDING_REVIEW'].includes(chore.status) : chore.status === status);
    const dateMatch = !date || chore.availableAt.startsWith(date);
    const childMatch = childId === 'ALL' || chore.assignedChildId === childId || chore.claimedByChildId === childId;
    return statusMatch && dateMatch && childMatch;
  }), [childId, date, instances.data, status]);
  const visibleGroups = useMemo(() => {
    const groups = new Map<string, Chore[]>();
    for (const chore of visible) {
      const template = templates.data?.find((item) => item.id === chore.templateId);
      const key = template?.recurrence.kind !== 'ONCE' ? `recurring:${chore.templateId}` : `single:${chore.id}`;
      groups.set(key, [...(groups.get(key) ?? []), chore]);
    }
    return [...groups.values()];
  }, [templates.data, visible]);

  const archive = async (template: Template, active: boolean) => {
    setError(null);
    try { await postJson(`/parent/templates/${template.id}/archive`, { active }); await templates.reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Template could not be updated.'); }
  };
  const remove = async (template: Template) => {
    setError(null);
    try { await api(`/parent/templates/${template.id}`, { method: 'DELETE' }); await templates.reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Template could not be deleted.'); }
  };

  const loading = (instances.loading && !instances.data) || (templates.loading && !templates.data) || (people.loading && !people.data) || (context.loading && !context.data);
  if (loading) return <LoadingBlock label="Loading chores…" />;
  const locale = navigator.language;
  return <div>
    <header className="page-heading"><div><h1>Chores</h1><p>Assign a chore to one or more children, edit it when plans change, and optionally save its configuration to your template library.</p></div><div className="page-actions"><Button variant="secondary" onClick={() => setCreating('GENERAL')}><Hand size={18} />General chore</Button><Button onClick={() => setCreating('ASSIGNED')}><Plus size={18} />Assigned chore</Button></div></header>
    {error || instances.error || templates.error || people.error || context.error ? <InlineNotice tone="error">{error ?? instances.error ?? templates.error ?? people.error ?? context.error}</InlineNotice> : null}
    <section className="section-panel"><div className="section-heading"><h2>Chore instances</h2><div className="filter-row"><Select aria-label="Filter by child" value={childId} onChange={(event) => setChildId(event.target.value)}><option value="ALL">All children</option>{people.data?.children.map((child) => <option key={child.id} value={child.id}>{child.displayName}</option>)}</Select><Select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="OPEN">Open and waiting</option><option value="ALL">All statuses</option><option value="COMPLETED_PENDING_REVIEW">Needs review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="EXPIRED">Expired</option><option value="CANCELLED">Cancelled</option></Select><TextInput aria-label="Filter by date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></div><div className="section-body chore-list">
      {visibleGroups.map((group) => <div key={group[0]!.id} className={group.length > 1 ? 'recurring-stack' : undefined}>{group.length > 1 ? <div className="recurring-stack-label"><CalendarClock size={16} />{group[0]!.title}<span>{group.length} scheduled copies</span></div> : null}{group.map((chore, index) => <ChoreCard key={chore.id} chore={chore} locale={locale} compact={group.length > 1 && index > 0} action={<ParentInstanceActions chore={chore} onChanged={instances.reload} onEdit={() => setEditing((templates.data ?? []).find((template) => template.id === chore.templateId) ?? null)} />}/>)}</div>)}
      {visible.length === 0 ? <EmptyState icon={<ClipboardList />} title="No chores match">Change the filters or create a new chore.</EmptyState> : null}
    </div></section>
    <section className="section-panel templates-panel"><div className="section-heading"><div><h2>Reusable templates</h2><p>Templates with generated chores are archived instead of deleted.</p></div></div><div className="template-list">
      {(templates.data ?? []).filter((template) => template.savedAsTemplate).map((template) => <article key={template.id} className="template-row"><div className="template-icon"><CalendarClock /></div><div><h3>{template.title}</h3><p>{template.assignmentType === 'ASSIGNED' ? 'Assigned' : 'Chore Board'} · {template.recurrence.kind.toLowerCase()} · {template.instanceCount} generated</p></div><span className={template.active ? 'template-active' : 'template-archived'}>{template.active ? 'Active' : 'Archived'}</span><div className="template-actions"><Button variant="quiet" size="sm" onClick={() => setEditing(template)}><Edit3 size={16} />Edit</Button><Button variant="quiet" size="sm" onClick={() => void archive(template, !template.active)}><Archive size={16} />{template.active ? 'Archive' : 'Reactivate'}</Button>{template.instanceCount === 0 ? <Button variant="danger" size="sm" onClick={() => void remove(template)}><Trash2 size={16} />Delete</Button> : null}</div></article>)}
      {templates.data?.filter((template) => template.savedAsTemplate).length === 0 ? <div className="section-body"><EmptyState icon={<CalendarClock />} title="No templates yet">Use “Save to template library” when creating a chore you want to reuse.</EmptyState></div> : null}
    </div></section>
    {creating || editing ? <Modal title={editing ? 'Edit chore template' : creating === 'GENERAL' ? 'Add to Chore Board' : 'Add assigned chore'} onClose={closeForm}><ChoreForm key={editing?.id ?? creating ?? 'new'} children={people.data?.children ?? []} initial={editing} initialType={creating ?? undefined} defaultApprovalMode={context.data?.household.settings.defaultApprovalMode ?? 'PARENT_APPROVAL'} onCancel={closeForm} onSaved={reloadAll} /></Modal> : null}
  </div>;
}
