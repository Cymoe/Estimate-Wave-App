import React, { useCallback, useEffect, useState } from "react";
import { officeLineAPI, type OfficeLineRow } from "../../lib/api";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const WHO: Record<OfficeLineRow["direction"], string> = {
  in: "You",
  out: "Office line",
  internal: "",
};
const KIND: Record<OfficeLineRow["kind"], string> = {
  message: "",
  brief: "Morning brief",
  action: "Did",
  ask: "Asked",
  error: "Problem",
};
const STATUS: Record<NonNullable<OfficeLineRow["ask"]>["status"], string> = {
  pending: "Waiting on you",
  done: "Done",
  declined: "Dropped",
  expired: "Expired",
  failed: "Failed",
};

/** The last 50 things the office line heard, said, did and asked; waiting asks can be answered here. */
export const OfficeLineLog: React.FC<{ organizationId: string }> = ({
  organizationId,
}) => {
  const [rows, setRows] = useState<OfficeLineRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      officeLineAPI
        .log(organizationId)
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Couldn’t load the log"),
        ),
    [organizationId],
  );
  useEffect(() => {
    load();
  }, [load]);

  const answer = async (askId: string, yes: boolean) => {
    setBusy(askId);
    try {
      await officeLineAPI.answer(organizationId, askId, yes);
      // Doing it runs in the background: look again once it's had a moment.
      if (yes) await new Promise((r) => setTimeout(r, 1500));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t go through");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-[#2A2A2A] pt-4" data-testid="office-line-log">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">What it did</h3>
        <button
          type="button"
          onClick={load}
          className="text-xs text-gray-400 hover:text-white"
        >
          Refresh
        </button>
      </div>
      {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
      {rows === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nothing yet. Text the line and it shows up here.
        </p>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded px-3 py-2 text-sm ${r.direction === "in" ? "bg-[#0F1A26]" : r.kind === "error" ? "bg-red-950/40" : "bg-[#111]"}`}
              data-testid="office-line-row"
            >
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium text-gray-300">
                  {KIND[r.kind] || WHO[r.direction]}
                </span>
                <span>{when(r.at)}</span>
                {r.ask && (
                  <span
                    className={
                      r.ask.status === "pending"
                        ? "text-amber-300"
                        : r.ask.status === "done"
                          ? "text-green-400"
                          : "text-gray-500"
                    }
                  >
                    {STATUS[r.ask.status]}
                  </span>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-line text-gray-200 break-words">
                {r.text}
              </p>
              {r.ask?.result && r.ask.status !== "pending" && (
                <p className="mt-0.5 text-xs text-gray-500">{r.ask.result}</p>
              )}
              {r.ask?.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => answer(r.ask!.id, true)}
                    className="px-3 py-1 bg-[#336699] text-white text-xs font-medium rounded hover:bg-[#2A5580] disabled:opacity-50"
                  >
                    {busy === r.ask.id ? "Working…" : "Do it"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => answer(r.ask!.id, false)}
                    className="px-3 py-1 border border-[#333] text-gray-300 text-xs rounded hover:bg-[#252525] disabled:opacity-50"
                  >
                    Don&rsquo;t
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
