import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { officeLineAPI, type OfficeLineSettings } from "../../lib/api";
import { OfficeLineLog } from "./OfficeLineLog";

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "That didn’t save";

/** "06:30" → "6:30 AM". */
const clockLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const BRIEF_TIMES = Array.from({ length: 11 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/**
 * Settings → General → Office line: the owner texts the Webb Leads number
 * and an agent works the company for them. Anything that reaches a client
 * or vendor, or spends, waits for their YES. Also the morning brief, and
 * the log of what it heard, did and asked.
 */
export const OfficeLineSetting: React.FC<{ organizationId: string }> = ({
  organizationId,
}) => {
  const [s, setS] = useState<OfficeLineSettings | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    officeLineAPI
      .get(organizationId)
      .then((next) => {
        if (!live) return;
        setS(next);
        setNotes(next.notes);
      })
      .catch((err) => live && setNote({ text: errorText(err), good: false }));
    return () => {
      live = false;
    };
  }, [organizationId]);

  const change = async (
    changes: Parameters<typeof officeLineAPI.set>[1],
    done?: string,
  ) => {
    if (!s) return;
    setBusy(true);
    setNote(null);
    try {
      const line = (await officeLineAPI.set(organizationId, changes)) as {
        on: boolean;
        briefAt?: string;
        allowSpend: boolean;
        notes?: string;
      };
      setS({
        ...s,
        on: line.on,
        briefAt: line.briefAt,
        allowSpend: line.allowSpend,
        notes: line.notes ?? "",
      });
      setNotes(line.notes ?? "");
      if (done) setNote({ text: done, good: true });
    } catch (err) {
      setNote({ text: errorText(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setNote(null);
    try {
      await officeLineAPI.test(organizationId);
      setNote({ text: `Sent to ${s?.myMobile}.`, good: true });
    } catch (err) {
      setNote({ text: errorText(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  const locked = !s?.canEdit || busy;
  return (
    <div className="bg-[#1A1A1A] rounded-lg p-6" data-testid="office-line">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">Office line</h2>
          <p className="text-sm text-gray-400">
            Text Webb Leads like you&rsquo;d text your office manager:
            &ldquo;what needs me today?&rdquo;, &ldquo;draft an estimate for
            the Millers&rsquo; deck&rdquo;, &ldquo;log that I called Bob&rdquo;.
            It does the work and texts back. Anything that goes to a client or
            vendor, or spends money, waits for you to reply YES.
          </p>
        </div>
        {s && (
          <button
            type="button"
            role="switch"
            aria-checked={s.on}
            aria-label="Office line"
            onClick={() => change({ on: !s.on })}
            disabled={locked || (!s.on && !s.myMobile)}
            className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${s.on ? "bg-[#336699]" : "bg-[#333333]"}`}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${s.on ? "translate-x-5" : ""}`}
            />
          </button>
        )}
      </div>

      {!s ? (
        <p className="text-sm text-gray-500 mt-4">{note?.text ?? "Loading…"}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {!s.myMobile ? (
            <p className="text-sm text-amber-200/90">
              Add your mobile in{" "}
              <Link
                to="/settings/organization?tab=notifications"
                className="underline hover:text-white"
              >
                Notifications
              </Link>{" "}
              first: that&rsquo;s the number the office line answers.
            </p>
          ) : (
            <p className="text-sm text-gray-300" data-testid="office-line-numbers">
              {s.lineNumber ? (
                <>
                  Text{" "}
                  <a
                    href={`sms:${s.lineNumber.replace(/\D/g, "")}`}
                    className="font-semibold text-white"
                  >
                    {s.lineNumber}
                  </a>{" "}
                  from {s.myMobile}.
                </>
              ) : (
                <>It answers texts from {s.myMobile}.</>
              )}
            </p>
          )}
          {s.on && (!s.ready.texting || !s.ready.assistant) && (
            <p className="text-sm text-gray-500">
              Webb Leads is finishing the line&rsquo;s setup; it starts
              answering once that&rsquo;s done.
            </p>
          )}

          {s.on && (
            <>
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm text-gray-300">
                    Morning brief
                  </span>
                  <span className="block text-xs text-gray-500">
                    Up to five things that need you today, by text, Central
                    time. Reply YES and a number to let it handle one.
                  </span>
                </span>
                <select
                  value={s.briefAt ?? ""}
                  disabled={locked}
                  onChange={(e) => change({ briefAt: e.target.value || null })}
                  className="bg-[#0A0A0A] border border-[#333] rounded px-3 py-2 text-sm text-white disabled:opacity-60"
                >
                  <option value="">Off</option>
                  {BRIEF_TIMES.map((t) => (
                    <option key={t} value={t}>
                      {clockLabel(t)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={s.allowSpend}
                  disabled={locked}
                  onChange={(e) => change({ allowSpend: e.target.checked })}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm text-gray-300">
                    Can buy leads and bid
                  </span>
                  <span className="block text-xs text-gray-500">
                    Each purchase or bid still waits for your YES, within the
                    daily limit.
                  </span>
                </span>
              </label>

              <label className="block">
                <span className="block text-sm text-gray-300 mb-1">
                  What it remembers
                </span>
                <textarea
                  value={notes}
                  rows={3}
                  maxLength={2000}
                  disabled={locked}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Text it “remember my cabinet guy is Midland Cabinet Co” or write it here."
                  className="w-full bg-[#0A0A0A] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#336699] disabled:opacity-60"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={locked || notes.trim() === s.notes}
                  onClick={() => change({ notes }, "Saved.")}
                  className="px-4 py-2 bg-[#336699] text-white text-sm font-medium rounded hover:bg-[#2A5580] disabled:opacity-50"
                >
                  Save notes
                </button>
                <button
                  type="button"
                  disabled={locked || !s.myMobile}
                  onClick={test}
                  className="px-4 py-2 border border-[#333] text-gray-200 text-sm font-medium rounded hover:bg-[#252525] disabled:opacity-50"
                >
                  Send me a test text
                </button>
              </div>
            </>
          )}

          {!s.canEdit && (
            <p className="text-sm text-amber-200/90">
              Ask an owner or admin of the company to change this.
            </p>
          )}
          {note && (
            <p
              role="status"
              className={`text-sm ${note.good ? "text-green-400" : "text-red-400"}`}
            >
              {note.text}
            </p>
          )}
          {s.canEdit && s.on && <OfficeLineLog organizationId={organizationId} />}
        </div>
      )}
    </div>
  );
};
