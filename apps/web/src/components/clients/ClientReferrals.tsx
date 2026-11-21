import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift } from "lucide-react";
import { referralsAPI, type ClientReferrals as Data } from "../../lib/api";

const LEAD_STATUS: Record<string, string> = {
  new: "New",
  no_answer: "No answer",
  contacted: "Contacted",
  scheduled: "Scheduled",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

/**
 * The friends a client sent with their referral link: where each stands, and
 * the reward once one became a signed job (owed until marked given). Hidden
 * until there's at least one.
 */
export const ClientReferrals: React.FC<{ clientId: string }> = ({
  clientId,
}) => {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      referralsAPI
        .forClient(clientId)
        .then(setData)
        .catch(() => setData(null)),
    [clientId],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!data || data.referrals.length === 0) return null;
  const owed = data.referrals.filter((r) => r.earned && !r.paidAt).length;

  const mark = async (leadId: string, paid: boolean) => {
    setBusy(leadId);
    try {
      await referralsAPI.markPaid(leadId, paid);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="mt-5 pt-5 border-t border-[#222222]"
      data-testid="client-referrals"
    >
      <h3 className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Gift className="w-4 h-4 text-gray-600" /> Referrals
      </h3>
      {owed > 0 && (
        <p className="text-sm text-amber-300 mb-2" data-testid="reward-owed">
          {owed === 1 ? "A reward is owed" : `${owed} rewards owed`}
          {data.reward ? `: ${data.reward}${owed > 1 ? " each" : ""}` : ""}
        </p>
      )}
      <div className="-mx-2">
        {data.referrals.map((r) => (
          <div
            key={r.leadId}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-2 py-2 rounded-md text-sm"
            data-testid="referral"
          >
            <button
              type="button"
              onClick={() => navigate(`/leads?lead=${r.leadId}`)}
              className="truncate text-left text-gray-100 hover:underline"
            >
              {r.name}
            </button>
            <span className="rounded-full px-2 py-0.5 text-xs bg-gray-500/15 text-gray-300">
              {LEAD_STATUS[r.status] ?? r.status}
            </span>
            {r.earned ? (
              r.paidAt ? (
                <button
                  type="button"
                  disabled={busy === r.leadId}
                  onClick={() => mark(r.leadId, false)}
                  className="text-xs text-green-400 hover:text-gray-300"
                  title="Tap to undo"
                >
                  Reward given
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy === r.leadId}
                  onClick={() => mark(r.leadId, true)}
                  className="rounded-md bg-[#336699] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2a5580] disabled:opacity-50"
                >
                  Mark reward given
                </button>
              )
            ) : (
              <span className="text-xs text-gray-600">Not signed yet</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
