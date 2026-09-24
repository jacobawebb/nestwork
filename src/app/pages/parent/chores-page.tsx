import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, Ban, CalendarClock, ClipboardList, Edit3, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { Chore, Household } from '@/app/types';
import { ChoreCard } from '@/components/chore-card';
import { Button, EmptyState, Field, InlineNotice, LoadingBlock, Modal, Select, TextArea, TextInput } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';
import { api, postJson } from '@/lib/api-client';
import { parseMoneyToMinor } from '@/lib/money';

interface Person { id: string; displayName: string; active: boolean }
interface PeopleData { children: Person[] }
interface ChorePage { items: Chore[]; page: number; pageSize: number; total: number; totalPages: number }
interface Template {
  id: string; title: string; instructions: string | null; assignmentType: 'ASSIGNED' | 'GENERAL'; assignedChildIds: string[];
  eligibleChildIds: string[]; amountMinor: number; currency: string; approvalMode: 'PARENT_APPROVAL' | 'AUTO_APPROVE';
  recurrence: { kind: 'ONCE' | 'DAILY' | 'WEEKLY'; interval?: number; weekdays?: number[]; startDate: string; availableTime: string; dueTime?: string | null; expiryTime?: string | null };
  active: boolean; savedAsTemplate: boolean; instanceCount: number;
}

const weekdays = [{ value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }];

function todayLocal() { return new Date().toLocaleDateString('en-CA'); }

function ChoreForm({ children, initial, source, defaultApprovalMode, onSaved, onCancel, onBack }: { children: Person[]; initial?: Template | null; source?: Template | null; defaultApprovalMode: 'PARENT_APPROVAL' | 'AUTO_APPROVE'; onSaved: () => void | Promise<void>; onCancel: () => void; onBack?: () => void }) {
  const seed = initial ?? source;
  const recurrence = seed?.recurrence;
  const [title, setTitle] = useState(seed?.title ?? '');
  const [instructions, setInstructions] = useState(seed?.instructions ?? '');
  const [assignedChildIds, setAssignedChildIds] = useState<string[]>(seed?.assignmentType === 'ASSIGNED' ? seed.assignedChildIds : []);
  const [eligibleChildIds, setEligibleChildIds] = useState<string[]>(seed?.assignmentType === 'GENERAL' ? seed.eligibleChildIds : []);
  const [amount, setAmount] = useState(seed ? (seed.amountMinor / 100).toFixed(2) : '');
  const [approvalMode, setApprovalMode] = useState<'PARENT_APPROVAL' | 'AUTO_APPROVE'>(seed?.approvalMode ?? defaultApprovalMode);
  const [kind, setKind] = useState<'ONCE' | 'DAILY' | 'WEEKLY'>(recurrence?.kind ?? 'ONCE');
  const [interval, setInterval] = useState(recurrence?.interval ?? 1);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(recurrence?.weekdays ?? [new Date().getDay()]);
  const [startDate, setStartDate] = useState(initial?.recurrence.startDate ?? todayLocal());
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
      const assignmentType = assignedChildIds.length ? 'ASSIGNED' : 'GENERAL';
      const body = { title, instructions: instructions || null, assignmentType, assignedChildIds, eligibleChildIds: assignmentType === 'GENERAL' ? eligibleChildIds : [], amountMinor, approvalMode, recurrence: rule, saveTemplate };
      if (initial) await postJson(`/parent/templates/${initial.id}`, body, 'PUT');
      else await postJson('/parent/templates', body);
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The chore could not be saved.'); }
    finally { setBusy(false); }
  };

  return <form className="form-stack" onSubmit={save}>
    <div className="form-grid"><Field label="Chore title"><TextInput value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required autoFocus /></Field><Field label="Earning amount"><TextInput value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" required /></Field></div>
    <Field label="Short instructions" hint="Plain text, up to 280 characters."><TextArea value={instructions ?? ''} onChange={(event) => setInstructions(event.target.value)} maxLength={280} /></Field>
    <fieldset className="choice-field"><legend>Assign to children (optional)</legend><p>Select one or more children for their own copies. Leave everyone unchecked to put the task on the Chore Board for anyone to claim.</p><div className="check-grid">{children.filter((child) => child.active).map((child) => <label key={child.id}><input type="checkbox" checked={assignedChildIds.includes(child.id)} onChange={(event) => setAssignedChildIds((current) => event.target.checked ? [...current, child.id] : current.filter((id) => id !== child.id))} />{child.displayName}</label>)}</div></fieldset>
    {assignedChildIds.length === 0 ? <fieldset className="choice-field"><legend>Who can claim? (optional)</legend><p>Leave everyone unchecked to allow all active children. Select children to limit who sees this Chore Board task.</p><div className="check-grid">{children.filter((child) => child.active).map((child) => <label key={child.id}><input type="checkbox" checked={eligibleChildIds.includes(child.id)} onChange={(event) => setEligibleChildIds((current) => event.target.checked ? [...current, child.id] : current.filter((id) => id !== child.id))} />{child.displayName}</label>)}</div></fieldset> : null}
    <Field label="Approval"><Select value={approvalMode} onChange={(event) => setApprovalMode(event.target.value as 'PARENT_APPROVAL' | 'AUTO_APPROVE')}><option value="PARENT_APPROVAL">Parent checks before credit</option><option value="AUTO_APPROVE">Credit when child marks done</option></Select></Field>
    <fieldset className="choice-field"><legend>Schedule</legend><div className="form-grid"><Field label="Repeats"><Select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="ONCE">One time</option><option value="DAILY">Every N days</option><option value="WEEKLY">Weekly on selected days</option></Select></Field>{kind !== 'ONCE' ? <Field label={kind === 'DAILY' ? 'Every number of days' : 'Every number of weeks'}><TextInput type="number" min={1} max={kind === 'DAILY' ? 365 : 52} value={interval} onChange={(event) => setInterval(Number(event.target.value))} /></Field> : null}<Field label="Local start date"><TextInput type="date" min={todayLocal()} value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></Field><Field label="Available at"><TextInput type="time" value={availableTime} onChange={(event) => setAvailableTime(event.target.value)} required /></Field><Field label="Due time (optional)"><TextInput type="time" value={dueTime ?? ''} onChange={(event) => setDueTime(event.target.value)} /></Field><Field label="Expiry time (optional)"><TextInput type="time" value={expiryTime ?? ''} onChange={(event) => setExpiryTime(event.target.value)} /></Field></div>{kind === 'WEEKLY' ? <div className="weekday-grid">{weekdays.map((day) => <label key={day.value}><input type="checkbox" checked={selectedWeekdays.includes(day.value)} onChange={(event) => setSelectedWeekdays((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value))} />{day.label}</label>)}</div> : null}</fieldset>
    <label className="toggle-row"><input type="checkbox" checked={saveTemplate} onChange={(event) => setSaveTemplate(event.target.checked)} /><span><strong>Save to template library</strong><small>Keep this configuration to reuse later. It does not change any other chores.</small></span></label>
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    <div className="modal-actions"><Button variant="secondary" onClick={onBack ?? onCancel}>{onBack ? 'Back' : 'Cancel'}</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create chore'}</Button></div>
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
  if (!cancelable && !returnable) return null;
  return <div className="parent-instance-actions">
    {chore.templateId ? <Button variant="quiet" size="sm" onClick={onEdit}><Edit3 size={16} />Edit</Button> : null}
    {returnable ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(`/parent/chores/${chore.id}/return-to-board`)}>Return to board</Button> : null}
    {cancelable ? <Button variant="quiet" size="sm" disabled={busy} onClick={() => void act(`/parent/chores/${chore.id}/cancel`)}><Ban size={16} />Cancel</Button> : null}
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
  </div>;
}

function RecurringChoreStack({ group, locale, templates, onReload, onEdit }: { group: Chore[]; locale: string; templates: Template[]; onReload: () => void | Promise<void>; onEdit: (template: Template) => void }) {
  const [expanded, setExpanded] = useState(false);
  const front = group[0]!;
  const edit = (chore: Chore) => {
    const template = templates.find((item) => item.id === chore.templateId);
    if (template) onEdit(template);
  };
  return <section className="recurring-stack" aria-label={`${front.title}, ${group.length} scheduled copies`}>
    <div className="recurring-stack-label"><CalendarClock size={16} /><span>Recurring chore</span><button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? 'Hide copies' : `${group.length} scheduled copies`}</button></div>
    <div className="recurring-stack-visual"><span className="recurring-backplate recurring-backplate-third" aria-hidden="true" /><span className="recurring-backplate recurring-backplate-second" aria-hidden="true" /><span className="recurring-backplate recurring-backplate-first" aria-hidden="true" /><div className="recurring-front-card"><ChoreCard chore={front} locale={locale} action={<ParentInstanceActions chore={front} onChanged={onReload} onEdit={() => edit(front)} />} /></div></div>
    {expanded ? <div className="recurring-copies" aria-label="Other scheduled copies">{group.slice(1).map((chore) => <ChoreCard key={chore.id} chore={chore} locale={locale} compact action={<ParentInstanceActions chore={chore} onChanged={onReload} onEdit={() => edit(chore)} />} />)}</div> : null}
  </section>;
}

export default function ChoresPage() {
  const [search, setSearch] = useSearchParams();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('OPEN');
  const [childId, setChildId] = useState('ALL');
  const [date, setDate] = useState('');
  const instancePath = useMemo(() => `/parent/chores/page?${new URLSearchParams({ page: String(page), status, childId, date, search: query })}`, [page, status, childId, date, query]);
  const instances = useApiResource<ChorePage>(instancePath);
  const templates = useApiResource<Template[]>('/parent/templates');
  const people = useApiResource<PeopleData>('/parent/people');
  const context = useApiResource<{ household: Household }>('/context');
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState<'choose' | 'fresh' | `template:${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedId = search.get('chore');
  const selectedInstance = useApiResource<Chore>(selectedId ? `/parent/chores/${selectedId}` : null);
  const selectedChore = selectedInstance.data?.id === selectedId ? selectedInstance.data : null;
  const linkedTemplate = templates.data?.find((template) => template.id === selectedChore?.templateId);
  const activeEditing = editing ?? linkedTemplate ?? null;
  const sourceTemplate = creating?.startsWith('template:') ? templates.data?.find((template) => template.id === creating.slice(9)) : null;

  useEffect(() => {
    if (search.has('new')) setCreating('choose');
  }, [search]);

  const closeForm = () => {
    setCreating(null);
    setEditing(null);
    if (search.has('new') || search.has('chore')) {
      const next = new URLSearchParams(search);
      next.delete('new');
      next.delete('chore');
      setSearch(next, { replace: true });
    }
  };
  const reloadAll = async () => { await Promise.all([instances.reload(), templates.reload()]); closeForm(); };
  const visible = useMemo(() => instances.data?.items ?? [], [instances.data]);
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
    <header className="page-heading"><div><h1>Chores</h1><p>Create a task, assign it to children, or leave it open for anyone to claim from the Chore Board.</p></div><div className="page-actions"><Button onClick={() => setCreating('choose')}><Plus size={18} />Add chore</Button></div></header>
    {error || instances.error || selectedInstance.error || templates.error || people.error || context.error ? <InlineNotice tone="error">{error ?? instances.error ?? selectedInstance.error ?? templates.error ?? people.error ?? context.error}</InlineNotice> : null}
    <section className="section-panel"><div className="section-heading"><h2>Chore instances</h2><div className="filter-row"><TextInput aria-label="Search chores" type="search" placeholder="Search chores or children" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /><Select aria-label="Filter by child" value={childId} onChange={(event) => { setChildId(event.target.value); setPage(1); }}><option value="ALL">All children</option>{people.data?.children.map((child) => <option key={child.id} value={child.id}>{child.displayName}</option>)}</Select><Select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="OPEN">Open and waiting</option><option value="ALL">All statuses</option><option value="COMPLETED_PENDING_REVIEW">Needs review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="EXPIRED">Expired</option><option value="CANCELLED">Cancelled</option></Select><TextInput aria-label="Filter by date" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></div></div><div className="section-body chore-list">
      {instances.loading ? <LoadingBlock label="Loading chores…" /> : visibleGroups.map((group) => group.length > 1 ? <RecurringChoreStack key={group[0]!.id} group={group} locale={locale} templates={templates.data ?? []} onReload={instances.reload} onEdit={setEditing} /> : <ChoreCard key={group[0]!.id} chore={group[0]!} locale={locale} action={<ParentInstanceActions chore={group[0]!} onChanged={instances.reload} onEdit={() => setEditing((templates.data ?? []).find((template) => template.id === group[0]!.templateId) ?? null)} />}/>) }
      {!instances.loading && visible.length === 0 ? <EmptyState icon={<ClipboardList />} title="No chores match">Change the filters or create a new chore.</EmptyState> : null}
    </div><div className="pagination"><span>{instances.data?.total ? `${(instances.data.page - 1) * instances.data.pageSize + 1}–${Math.min(instances.data.page * instances.data.pageSize, instances.data.total)} of ${instances.data.total}` : '0 chores'}</span><div><Button variant="secondary" size="sm" disabled={!instances.data || instances.data.page <= 1 || instances.loading} onClick={() => setPage((instances.data?.page ?? 1) - 1)}>Previous</Button><span>Page {instances.data?.page ?? 1} of {instances.data?.totalPages ?? 1}</span><Button variant="secondary" size="sm" disabled={!instances.data || instances.data.page >= instances.data.totalPages || instances.loading} onClick={() => setPage((instances.data?.page ?? 1) + 1)}>Next</Button></div></div></section>
    <section className="section-panel templates-panel"><div className="section-heading"><div><h2>Reusable templates</h2><p>Templates with generated chores are archived instead of deleted.</p></div></div><div className="template-list">
      {(templates.data ?? []).filter((template) => template.savedAsTemplate).map((template) => <article key={template.id} className="template-row"><div className="template-icon"><CalendarClock /></div><div><h3>{template.title}</h3><p>{template.assignmentType === 'ASSIGNED' ? 'Assigned' : 'Chore Board'} · {template.recurrence.kind.toLowerCase()} · {template.instanceCount} generated</p></div><span className={template.active ? 'template-active' : 'template-archived'}>{template.active ? 'Active' : 'Archived'}</span><div className="template-actions"><Button variant="quiet" size="sm" onClick={() => setEditing(template)}><Edit3 size={16} />Edit</Button><Button variant="quiet" size="sm" onClick={() => void archive(template, !template.active)}><Archive size={16} />{template.active ? 'Archive' : 'Reactivate'}</Button>{template.instanceCount === 0 ? <Button variant="danger" size="sm" onClick={() => void remove(template)}><Trash2 size={16} />Delete</Button> : null}</div></article>)}
      {templates.data?.filter((template) => template.savedAsTemplate).length === 0 ? <div className="section-body"><EmptyState icon={<CalendarClock />} title="No templates yet">Use “Save to template library” when creating a chore you want to reuse.</EmptyState></div> : null}
    </div></section>
    {activeEditing ? <Modal title="Edit chore template" onClose={closeForm}><ChoreForm key={activeEditing.id} children={people.data?.children ?? []} initial={activeEditing} defaultApprovalMode={context.data?.household.settings.defaultApprovalMode ?? 'PARENT_APPROVAL'} onCancel={closeForm} onSaved={reloadAll} /></Modal> : creating === 'choose' ? <Modal title="Add chore · Step 1 of 2" onClose={closeForm}><div className="creation-choices"><p>Start with a fresh task or use a saved template. You can adjust every detail before creating the chore.</p><button type="button" className="creation-choice" onClick={() => setCreating('fresh')}><Plus size={21} /><span><strong>Fresh task</strong><small>Write a new chore from scratch</small></span></button>{(templates.data ?? []).filter((template) => template.savedAsTemplate && template.active).map((template) => <button type="button" className="creation-choice" key={template.id} onClick={() => setCreating(`template:${template.id}`)}><CalendarClock size={21} /><span><strong>{template.title}</strong><small>Use saved template · {template.assignmentType === 'GENERAL' ? 'Chore Board' : 'Assigned'}</small></span></button>)}{templates.data?.every((template) => !template.savedAsTemplate || !template.active) ? <p>No saved templates yet. Choose Fresh task to get started.</p> : null}</div></Modal> : creating ? <Modal title="Create chore · Step 2 of 2" onClose={closeForm}><ChoreForm key={creating} children={people.data?.children ?? []} source={sourceTemplate} defaultApprovalMode={context.data?.household.settings.defaultApprovalMode ?? 'PARENT_APPROVAL'} onBack={() => setCreating('choose')} onCancel={closeForm} onSaved={reloadAll} /></Modal> : null}
    {selectedChore && !linkedTemplate && !activeEditing ? <Modal title="View chore" onClose={closeForm}><ChoreCard chore={selectedChore} locale={locale} showDescription /><div className="modal-actions"><Button variant="secondary" onClick={closeForm}>Close</Button></div></Modal> : null}
  </div>;
}
