import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare, Pencil, Users, X } from 'lucide-react';
import { crewAPI, tasksAPI, type CrewMember, type Schedule as ScheduleData, type ScheduledTask } from '../../lib/api';
import { AddCrewForm } from './ProjectTasks';
import { addDays, fromIso, isoDay, mondayOf, textLink } from './taskDates';
import { LANGUAGE_OPTIONS } from '../../i18n/lang';

const field = 'bg-[#0A0A0A] border border-[#333] px-2.5 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#336699]';
const secondary = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-200 bg-[#1E1E1E] border border-[#333] hover:bg-[#2a2a2a] disabled:opacity-50';
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');

const onDay = (task: ScheduledTask, day: string) => task.startDate! <= day && (task.endDate ?? task.startDate!) >= day;

/** The company's crew: add people, fix their details, take them off the list. */
const CrewManager: React.FC<{ organizationId: string; crew: CrewMember[]; onChange: () => void; onClose: () => void }> = ({
  organizationId,
  crew,
  onChange,
  onClose,
}) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', phone: '', trade: '', language: 'en' as 'en' | 'es' });
  const [error, setError] = useState<string | null>(null);
  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      onChange();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <section className="bg-[#1a1a1a] border border-[#333] p-4 space-y-3" aria-label="Crew">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Your crew</h3>
        <button type="button" onClick={onClose} aria-label="Close crew" className="p-1 text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-400">The people you put on jobs, your own and your subs. They don&rsquo;t need a Webb Leads login; you can text them their work.</p>
      {crew.length > 0 && (
        <ul className="divide-y divide-[#262626] border border-[#262626]">
          {crew.map((person) => (
            <li key={person.id} className="px-3 py-2 text-sm">
              {editing === person.id ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      await crewAPI.update(person.id, { name: draft.name, phone: draft.phone || undefined, trade: draft.trade || undefined, language: draft.language });
                      setEditing(null);
                    });
                  }}
                >
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Name" className={`${field} flex-1 min-w-[8rem]`} />
                  <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} aria-label="Phone" inputMode="tel" className={`${field} w-32`} />
                  <input value={draft.trade} onChange={(e) => setDraft({ ...draft, trade: e.target.value })} aria-label="Trade" className={`${field} w-36`} />
                  <select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as 'en' | 'es' })} aria-label="Language" className={`${field} w-28`}>
                    {LANGUAGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={secondary}>
                    Save
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex-1 min-w-0 truncate text-white">
                    {person.name}
                    <span className="text-gray-500">{[person.trade, person.phone, person.language === 'es' ? 'Español' : undefined].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Edit ${person.name}`}
                    onClick={() => {
                      setEditing(person.id);
                      setDraft({ name: person.name, phone: person.phone ?? '', trade: person.trade ?? '', language: person.language ?? 'en' });
                    }}
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => window.confirm(`Take ${person.name} off your crew? Tasks they were on keep their name.`) && act(() => crewAPI.archive(person.id, true))}
                    className="text-xs text-gray-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <AddCrewForm organizationId={organizationId} onAdded={onChange} />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  );
};

/** One task on a day of the schedule. */
const TaskCard: React.FC<{ task: ScheduledTask; onOpen: (projectId: string) => void }> = ({ task, onOpen }) => (
  <div className={`border border-[#333] bg-[#1E1E1E] text-left ${task.done ? 'opacity-50' : ''}`} data-testid="schedule-task">
    <button type="button" onClick={() => onOpen(task.projectId)} className="w-full px-2.5 py-2 text-left hover:bg-[#262626]">
      <span className={`block text-sm leading-snug ${task.done ? 'line-through text-gray-400' : 'text-white'}`}>{task.title}</span>
      <span className="block text-xs text-[#5b8fc7] truncate">{task.projectName}</span>
      {task.crew.length > 0 && <span className="block text-xs text-gray-400 truncate">{task.crew.map((c) => c.name).join(', ')}</span>}
    </button>
    {task.crew.some((c) => c.phone) && (
      <div className="flex flex-wrap gap-x-3 px-2.5 pb-2">
        {task.crew
          .filter((c) => c.phone)
          .map((c) => (
            <a key={c.id} href={textLink(c.phone!, task, task.address ?? '', c.language)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white">
              <MessageSquare className="w-3 h-3" />
              Text {c.name.split(' ')[0]}
            </a>
          ))}
      </div>
    )}
  </div>
);

/**
 * The week across every project: each day's tasks and who's on them, so
 * nobody is double-booked and every job has its crew.
 */
export const ScheduleView: React.FC<{ organizationId: string; onOpenProject: (projectId: string) => void; today?: string }> = ({
  organizationId,
  onOpenProject,
  today = isoDay(new Date()),
}) => {
  const [week, setWeek] = useState(() => mondayOf(today));
  const [data, setData] = useState<ScheduleData | null>(null);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [who, setWho] = useState('all');
  const [showCrew, setShowCrew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await tasksAPI.schedule(organizationId, days[0], days[6]));
    } catch (err) {
      setError(errorText(err));
      setData({ tasks: [], projects: [] });
    }
  }, [organizationId, days]);
  const loadCrew = useCallback(() => {
    crewAPI
      .list(organizationId)
      .then(setCrew)
      .catch(() => setCrew([]));
  }, [organizationId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(loadCrew, [loadCrew]);

  const tasks = (data?.tasks ?? []).filter((t) => (who === 'all' ? true : who === 'none' ? t.crew.length === 0 : t.crew.some((c) => c.id === who)));
  const label = `${fromIso(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${fromIso(days[6]).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;

  return (
    <div className="p-4 space-y-4" data-testid="schedule">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week" className={`${secondary} px-2`}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setWeek(mondayOf(today))} className={secondary}>
          This week
        </button>
        <button type="button" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" className={`${secondary} px-2`}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-sm text-white font-medium ml-1">{label}</span>
        <span className="ml-auto flex items-center gap-2">
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose schedule" className={field}>
            <option value="all">Everyone</option>
            {crew.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="none">No one assigned</option>
          </select>
          <button type="button" onClick={() => setShowCrew((open) => !open)} aria-expanded={showCrew} className={secondary}>
            <Users className="w-4 h-4" />
            Crew{crew.length ? ` · ${crew.length}` : ''}
          </button>
        </span>
      </div>

      {showCrew && (
        <CrewManager
          organizationId={organizationId}
          crew={crew}
          onChange={() => {
            loadCrew();
            load();
          }}
          onClose={() => setShowCrew(false)}
        />
      )}

      {data && data.projects.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs" aria-label="Jobs running this week">
          <span className="text-gray-500 py-1">Jobs this week:</span>
          {data.projects.map((p) => (
            <button key={p.id} type="button" onClick={() => onOpenProject(p.id)} className="px-2 py-1 bg-[#336699]/15 text-[#8db4dc] hover:bg-[#336699]/30">
              {p.name}
            </button>
          ))}
        </div>
      )}

      {data === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {/* A column a day on iPad and up; a list of days on a phone. */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-[#333] border border-[#333]">
            {days.map((day) => {
              const todays = tasks.filter((t) => onDay(t, day));
              const d = fromIso(day);
              return (
                <div key={day} className={`bg-[#121212] min-h-[4rem] md:min-h-[14rem] p-2 space-y-2 ${todays.length === 0 ? 'hidden md:block' : ''}`} data-testid={`day-${day}`}>
                  <div className={`text-xs uppercase tracking-wide ${day === today ? 'text-[#5b8fc7] font-semibold' : 'text-gray-500'}`}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
                  </div>
                  {todays.map((t) => (
                    <TaskCard key={t.id} task={t} onOpen={onOpenProject} />
                  ))}
                </div>
              );
            })}
          </div>
          {tasks.length === 0 && (
            <div className="bg-[#1a1a1a] border border-[#333] px-4 py-6 text-center" data-testid="schedule-empty">
              <p className="text-sm text-white">Nothing scheduled this week</p>
              <p className="mt-1 text-sm text-gray-500">Open a project, add tasks on its Tasks tab, and give them days and crew.</p>
            </div>
          )}
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
};
