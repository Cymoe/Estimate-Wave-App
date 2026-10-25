import React, { useCallback, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { assistantsAPI, type AssistantConnection } from '../../lib/api';
import { input, primary, secondary } from '../ops/ui';

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Claude or ChatGPT connected to this company by the signed-in person:
 * what each may do, its daily spending limit, and Disconnect.
 */
export const ConnectedAssistants: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [data, setData] = useState<{ canSpend: boolean; connections: AssistantConnection[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    assistantsAPI
      .connections(organizationId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your assistants"));
  }, [organizationId]);
  useEffect(load, [load]);

  if (!data) return <p className="text-sm text-gray-400">{error ?? 'Loading…'}</p>;

  return (
    <div className="space-y-4" data-testid="connected-assistants">
      <p className="text-sm text-gray-400">
        Run Tolliver from Claude or ChatGPT: ask what's new, look up a lead, log a call or place a bid. To connect, add Tolliver as a
        connector in the assistant and sign in; it shows up here.
      </p>
      {data.connections.length === 0 ? (
        <p className="text-sm text-gray-500">No assistants connected to this company yet.</p>
      ) : (
        data.connections.map((c) => <Row key={c.id} connection={c} canSpend={data.canSpend} onChange={load} />)
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
};

function Row({ connection: c, canSpend, onChange }: { connection: AssistantConnection; canSpend: boolean; onChange: () => void }) {
  const [cap, setCap] = useState(String(c.dailyCapCents ? c.dailyCapCents / 100 : 500));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded border border-[#333] p-4" data-testid="assistant-row">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white font-medium inline-flex items-center gap-2">
            <Bot className="w-4 h-4 text-gray-400" /> {c.appName}
          </p>
          <p className="text-xs text-gray-500">
            Connected {day(c.connectedAt)}
            {c.lastUsedAt ? ` · last used ${day(new Date(c.lastUsedAt).toISOString())}` : ''}
          </p>
          <p className="text-sm text-gray-300 mt-1">
            {c.spending
              ? `Can buy and bid, up to ${dollars(c.dailyCapCents)} a day (${dollars(c.spentTodayCents)} spent today)`
              : 'Can see and update leads; buying and bidding are off'}
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => act(() => assistantsAPI.disconnect(c.id))} className={secondary}>
          Disconnect
        </button>
      </div>
      {canSpend && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor={`cap-${c.id}`}>
              Daily limit ($)
            </label>
            <input id={`cap-${c.id}`} type="number" min="1" step="1" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} className={`${input} w-32`} />
          </div>
          <button type="button" disabled={busy} onClick={() => act(() => assistantsAPI.update(c.id, true, Number(cap)))} className={primary}>
            {c.spending ? 'Save limit' : 'Turn on buying'}
          </button>
          {c.spending && (
            <button type="button" disabled={busy} onClick={() => act(() => assistantsAPI.update(c.id, false))} className={secondary}>
              Turn off buying
            </button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}
