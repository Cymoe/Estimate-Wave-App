import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, MessageSquare, Plus, Trash2, Users } from 'lucide-react';
import { crewAPI, tasksAPI, type CrewMember, type ProjectTask } from '../../lib/api';
import { taskDays, textLink } from './taskDates';
import { LANGUAGE_OPTIONS } from '../../i18n/lang';

const field = 'bg-[#0A0A0A] border border-[#333] px-2.5 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#336699]';
const secondary = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-200 bg-[#1E1E1E] border border-[#333] hover:bg-[#2a2a2a] disabled:opacity-50';
const primary = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50';
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');

/** Adding someone to the company's crew, right where they're needed. */
export const AddCrewForm: React.FC<{ organizationId: string; onAdded: (person: CrewMember) => void; onCancel?: () => void }> = ({
  organizationId,
  onAdded,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [trade, setTrade] = useState('');
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = { name: name.trim(), phone: phone.trim() || undefined, trade: trade.trim() || undefined, language };
      const id = await crewAPI.add(organizationId, data);
      onAdded({ id, ...data, archived: false });
      setName('');
      setPhone('');
      setTrade('');
      setLanguage('en');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2" aria-label="Add a crew member">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Crew member name" className={`${field} flex-1 min-w-[8rem]`} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" inputMode="tel" aria-label="Crew member phone" className={`${field} w-32`} />
      <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Trade (e.g. Roofer)" aria-label="Crew member trade" className={`${field} w-40`} />
      <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'es')} aria-label="Crew member language" className={`${field} w-28`}>
        {LANGUAGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={busy || !name.trim()} className={primary}>
        Add
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className={secondary}>
          Cancel
        </button>
      )}
      {error && <p className="basis-full text-sm text-red-400">{error}</p>}
    </form>
  );
};

/** Who's on a task: the company's crew as chips to tap on and off. */
const CrewPicker: React.FC<{
  organizationId: string;
  crew: CrewMember[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onCrewAdded: (person: CrewMember) => void;
}> = ({ organizationId, crew, selected, onChange, onCrewAdded }) => {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Crew on this task">
        {crew.map((person) => {
          const on = selected.includes(person.id);
          return (
            <button
              key={person.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((id) => id !== person.id) : [...selected, person.id])}
              className={`px-2.5 py-1 text-xs border ${on ? 'bg-[#336699] border-[#336699] text-white' : 'bg-[#1E1E1E] border-[#333] text-gray-300 hover:bg-[#2a2a2a]'}`}
            >
              {person.name}
              {person.trade && <span className={on ? 'text-white/70' : 'text-gray-500'}> · {person.trade}</span>}
            </button>
          );
        })}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="px-2.5 py-1 text-xs border border-dashed border-[#444] text-gray-400 hover:text-white">
            + Crew member
          </button>
        )}
      </div>
      {adding && (
        <AddCrewForm
          organizationId={organizationId}
          onAdded={(person) => {
            onCrewAdded(person);
            onChange([...selected, person.id]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
};

/** One task: tick it done, or open it to change its days, crew and notes. */
const TaskRow: React.FC<{
  task: ProjectTask;
  organizationId: string;
  crew: CrewMember[];
  place: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  onCrewAdded: (person: CrewMember) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}> = ({ task, organizationId, crew, place, open, onOpen, onCrewAdded, onChanged, onError }) => {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes ?? '');
  }, [task.title, task.notes]);

  const save = async (data: Parameters<typeof tasksAPI.update>[1]) => {
    try {
      await tasksAPI.update(task.id, data);
      onChanged();
    } catch (err) {
      onError(errorText(err));
    }
  };
  // Archived crew still on the task stay listed so they can be taken off.
  const pickable = [...crew, ...task.crew.filter((c) => !crew.some((p) => p.id === c.id)).map((c) => ({ ...c, archived: true }))];

  return (
    <li className={`px-4 py-3 ${task.done ? 'opacity-60' : ''}`} data-testid="task-row">
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
          onClick={() => save({ done: !task.done })}
          className={`mt-0.5 w-5 h-5 flex-shrink-0 border flex items-center justify-center ${task.done ? 'bg-green-600 border-green-600' : 'border-[#555] hover:border-white'}`}
        >
          {task.done && <Check className="w-3.5 h-3.5 text-white" />}
        </button>
        <button type="button" onClick={() => onOpen(!open)} aria-expanded={open} className="flex-1 min-w-0 text-left">
          <span className={`block text-sm ${task.done ? 'line-through text-gray-400' : 'text-white'}`}>{task.title}</span>
          <span className="block text-xs text-gray-500">
            {[taskDays(task) || 'No date', task.crew.map((c) => c.name).join(', ') || 'No one on it yet'].join(' · ')}
          </span>
        </button>
        {!open &&
          task.crew
            .filter((c) => c.phone)
            .slice(0, 2)
            .map((c) => (
              <a key={c.id} href={textLink(c.phone!, task, place)} className="p-1.5 text-gray-400 hover:text-white" aria-label={`Text ${c.name}`} title={`Text ${c.name}`}>
                <MessageSquare className="w-4 h-4" />
              </a>
            ))}
      </div>
      {open && (
        <div className="mt-3 ml-8 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title.trim() !== task.title && save({ title })}
            aria-label="Task"
            className={`${field} w-full`}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <CalendarDays className="w-4 h-4" />
            <input type="date" value={task.startDate ?? ''} onChange={(e) => save({ startDate: e.target.value || null })} aria-label="Starts" className={field} />
            to
            <input
              type="date"
              value={task.endDate ?? ''}
              min={task.startDate}
              onChange={(e) => save({ endDate: e.target.value || null })}
              aria-label="Ends"
              className={field}
            />
          </div>
          <div className="flex items-start gap-2">
            <Users className="w-4 h-4 mt-1 text-gray-400 flex-shrink-0" />
            <CrewPicker organizationId={organizationId} crew={pickable} selected={task.crew.map((c) => c.id)} onChange={(crewIds) => save({ crewIds })} onCrewAdded={onCrewAdded} />
          </div>
          {task.crew.some((c) => c.phone) && (
            <div className="flex flex-wrap gap-2">
              {task.crew
                .filter((c) => c.phone)
                .map((c) => (
                  <a key={c.id} href={textLink(c.phone!, task, place)} className={secondary}>
                    <MessageSquare className="w-4 h-4" />
                    Text {c.name.split(' ')[0]}
                  </a>
                ))}
            </div>
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (task.notes ?? '') && save({ notes })}
            placeholder="Notes for the crew: gate code, where to stage materials…"
            aria-label="Notes"
            rows={2}
            className={`${field} w-full resize-none`}
          />
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Delete “${task.title}”?`)) return;
              try {
                await tasksAPI.remove(task.id);
                onChanged();
              } catch (err) {
                onError(errorText(err));
              }
            }}
            className="inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300"
          >
            <Trash2 className="w-4 h-4" />
            Delete task
          </button>
        </div>
      )}
    </li>
  );
};

/**
 * A project's tasks: what needs doing, on which days, and who's on it.
 * They show on the company's schedule (Projects → Schedule).
 */
export const ProjectTasks: React.FC<{ projectId: string; organizationId: string; place?: string; onCount?: (open: number) => void }> = ({
  projectId,
  organizationId,
  place = '',
  onCount,
}) => {
  const [tasks, setTasks] = useState<ProjectTask[] | null>(null);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await tasksAPI.forProject(projectId);
      setTasks(next);
      onCount?.(next.filter((t) => !t.done).length);
    } catch (err) {
      setError(errorText(err));
      setTasks((current) => current ?? []);
    }
  }, [projectId, onCount]);
  useEffect(() => {
    load();
    crewAPI
      .list(organizationId)
      .then(setCrew)
      .catch(() => setCrew([]));
  }, [load, organizationId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await tasksAPI.add(projectId, { title: title.trim(), startDate: startDate || undefined });
      setTitle('');
      setStartDate('');
      await load();
      setOpenId(id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (tasks === null) return <p className="text-sm text-gray-500">Loading…</p>;
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const rows = (list: ProjectTask[]) =>
    list.map((task) => (
      <TaskRow
        key={task.id}
        task={task}
        organizationId={organizationId}
        crew={crew}
        place={place}
        open={openId === task.id}
        onOpen={(isOpen) => setOpenId(isOpen ? task.id : null)}
        onCrewAdded={(person) => setCrew((current) => [...current, person].sort((a, b) => a.name.localeCompare(b.name)))}
        onChanged={load}
        onError={setError}
      />
    ));

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-[#1a1a1a] border border-[#333] p-3 flex flex-wrap items-center gap-2" aria-label="Add a task">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task: Tear-off, Dry-in, Final walk-through…" aria-label="New task" className={`${field} flex-1 min-w-[12rem]`} />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="New task date" className={field} />
        <button type="submit" disabled={busy || !title.trim()} className={primary}>
          <Plus className="w-4 h-4" />
          Add
        </button>
      </form>

      {tasks.length === 0 ? (
        <div className="bg-[#1a1a1a] border border-[#333] px-4 py-8 text-center" data-testid="tasks-empty">
          <p className="text-sm text-white">No tasks yet</p>
          <p className="mt-1 text-sm text-gray-500">Break the job into steps, give each its days and crew, and it shows on your schedule.</p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <ul className="bg-[#1a1a1a] border border-[#333] divide-y divide-[#262626]" aria-label="To do">
              {rows(open)}
            </ul>
          )}
          {done.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Done · {done.length}</h3>
              <ul className="bg-[#1a1a1a] border border-[#333] divide-y divide-[#262626]" aria-label="Done">
                {rows(done)}
              </ul>
            </section>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
};
