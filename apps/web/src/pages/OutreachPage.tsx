import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Download, Trash2 } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { outreachAPI, type OutreachList, type OutreachListSummary, type OutreachRow, type OutreachRowStatus } from '../lib/api';
import { AskListSheet } from '../components/outreach/AskListSheet';
import { OutreachRows, RowSheet } from '../components/outreach/OutreachRows';
import { csvName, download, outreachCsv } from '../components/outreach/outreachCsv';
import { useConfirm } from '../components/common/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { isStaff } from '../lib/roles';
import { WHO_LABEL } from '../../convex/lib/outreach';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const iconButton = 'w-11 h-11 inline-flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2A2A2A] border border-[#333333]';

/** One saved list: its people, each opening to the addresses and a status. */
const ListView: React.FC<{ organizationId: string; listId: string; onGone: () => void }> = ({ organizationId, listId, onGone }) => {
  const [list, setList] = useState<OutreachList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OutreachRow | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    let live = true;
    outreachAPI
      .get(organizationId, listId)
      .then((l) => live && setList(l))
      .catch((err) => live && setError(err instanceof Error ? err.message : "The list couldn't be loaded"));
    return () => {
      live = false;
    };
  }, [organizationId, listId]);

  const setStatus = async (row: OutreachRow, status: OutreachRowStatus, note: string) => {
    await outreachAPI.setStatus(organizationId, row.id, status, note || undefined);
    setList((l) => {
      if (!l) return l;
      const rows = l.rows.map((r) => (r.id === row.id ? { ...r, status, note: note || undefined } : r));
      return { ...l, rows, done: rows.filter((r) => r.status === 'done' || r.status === 'skip').length };
    });
    setOpen((o) => (o && o.id === row.id ? { ...o, status, note: note || undefined } : o));
  };

  const remove = async () => {
    if (!list) return;
    if (!(await confirm({ title: `Delete “${list.title}”?`, message: 'The roll keeps the owners; the list and its notes go.', confirmLabel: 'Delete' }))) return;
    await outreachAPI.remove(organizationId, listId);
    onGone();
  };

  if (error) return <p className="p-6 text-sm text-red-400">{error}</p>;
  if (!list) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-4" data-testid="outreach-list">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/outreach" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white -ml-1">
            <ChevronLeft className="w-4 h-4" /> Lists
          </Link>
          <h1 className="text-2xl font-semibold text-white break-words">{list.title}</h1>
          <p className="text-sm text-gray-400">
            {WHO_LABEL[list.who]} · {list.rowCount} {list.rowCount === 1 ? 'owner' : 'owners'} · {list.done} done · {day(list.createdAt)}
          </p>
          {list.truncated && <p className="text-sm text-amber-300">The top of a longer list; ask for a narrower one to reach the rest.</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => download(csvName(list.title), outreachCsv(list.rows))} aria-label="Export CSV" title="Export CSV" className={iconButton}>
            <Download className="w-4 h-4" />
          </button>
          <button type="button" onClick={remove} aria-label="Delete list" title="Delete list" className={iconButton}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>
      {list.rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nobody matched. Ask for a wider list.</p>
      ) : (
        <OutreachRows rows={list.rows} onOpen={setOpen} />
      )}
      <RowSheet row={open} onClose={() => setOpen(null)} onStatus={setStatus} />
      {confirmDialog}
    </div>
  );
};

type OwnersState = Awaited<ReturnType<typeof outreachAPI.status>>;

/** Staff only: when the roll was last grouped into owners, and a way to do it again. */
const OwnersLine: React.FC = () => {
  const [state, setState] = useState<OwnersState | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    outreachAPI
      .status()
      .then(setState)
      .catch(() => setState(undefined));
  }, [busy]);
  const rebuild = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await outreachAPI.rebuild();
      setNote(r.error ? `Rebuild failed: ${r.error}` : `Grouped ${r.fetched.toLocaleString()} parcels into owners (${(r.added + r.updated).toLocaleString()} written).`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "The rebuild couldn't run");
    } finally {
      setBusy(false);
    }
  };
  if (state === undefined) return null;
  return (
    <p className="text-xs text-gray-500" data-testid="owners-line">
      {state === null
        ? "The roll hasn't been grouped into owners yet, so every list is empty."
        : state.error
          ? `The owners rebuild on ${day(state.syncedAt)} failed: ${state.error}`
          : `Owners grouped ${day(state.syncedAt)} from ${state.parcels.toLocaleString()} parcels.`}{' '}
      <button type="button" onClick={rebuild} disabled={busy} className="text-[#7fb0e0] hover:text-white disabled:opacity-50">
        {busy ? 'Rebuilding…' : 'Rebuild owners'}
      </button>
      {note && <span className="block text-gray-400">{note}</span>}
    </p>
  );
};

/**
 * Outreach: mailing lists from the county roll, asked for in plain words.
 * The + button's "Outreach list" opens the ask; each saved list opens to
 * its people.
 */
const OutreachPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id || undefined;
  const { user } = useAuth();
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lists, setLists] = useState<OutreachListSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(() => {
    if (!organizationId) return;
    setError(null);
    outreachAPI
      .lists(organizationId)
      .then(setLists)
      .catch((err) => setError(err instanceof Error ? err.message : "The lists couldn't be loaded"));
  }, [organizationId]);
  useEffect(() => {
    if (!listId) load();
  }, [load, listId]);

  // The blue + button's "Outreach list" opens /outreach?new=1.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setAsking(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!organizationId) return <p className="p-6 text-gray-400">Pick a company first.</p>;
  if (listId) return <ListView organizationId={organizationId} listId={listId} onGone={() => navigate('/outreach')} />;

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-4" data-testid="outreach-page">
      <header>
        <h1 className="text-2xl font-semibold text-white">Outreach</h1>
        <p className="text-sm text-gray-400">Mailing lists from the Midland County roll. Names and mailing addresses; no phone numbers.</p>
        {isStaff(user) && <OwnersLine />}
      </header>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {lists === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="outreach-empty">
          No lists yet. Tap + and say who you want to reach.
        </p>
      ) : (
        <ul className="bg-[#121212] border border-[#333333] divide-y divide-[#333333]" aria-label="Lists">
          {lists.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => navigate(`/outreach/${l.id}`)} className="w-full text-left px-4 py-3 hover:bg-[#1A1A1A]">
                <div className="text-[15px] text-white truncate">{l.title}</div>
                <div className="text-sm text-gray-400">
                  {WHO_LABEL[l.who]} · {l.rowCount} {l.rowCount === 1 ? 'owner' : 'owners'} · {l.done} done · {day(l.createdAt)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AskListSheet open={asking} organizationId={organizationId} onClose={() => setAsking(false)} onSaved={(id) => navigate(`/outreach/${id}`)} />
    </div>
  );
};

export default OutreachPage;
