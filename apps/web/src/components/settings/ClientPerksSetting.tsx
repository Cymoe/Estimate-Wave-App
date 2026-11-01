import React, { useEffect, useState } from "react";
import { organizationsAPI } from "../../lib/api";

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "That didn’t save";
const input =
  "w-full bg-[#0A0A0A] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#336699] disabled:opacity-60";

/**
 * What clients get back once their job is done, on their portal: a "How did
 * we do?" card with the company's review link, and a "Know someone?" card
 * with a referral link and the company's reward. Each shows only when set.
 */
export const ClientPerksSetting: React.FC<{ organizationId: string }> = ({
  organizationId,
}) => {
  const [reviewUrl, setReviewUrl] = useState("");
  const [reward, setReward] = useState("");
  const [saved, setSaved] = useState({ reviewUrl: "", reward: "" });
  const [canEdit, setCanEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    Promise.all([
      organizationsAPI.getById(organizationId),
      organizationsAPI.myRole(organizationId).catch(() => "member" as const),
    ])
      .then(([org, role]) => {
        if (!live) return;
        const perks = (
          org as {
            perks?: { reviewUrl?: string; referralReward?: string };
          } | null
        )?.perks;
        const next = {
          reviewUrl: perks?.reviewUrl ?? "",
          reward: perks?.referralReward ?? "",
        };
        setReviewUrl(next.reviewUrl);
        setReward(next.reward);
        setSaved(next);
        setCanEdit(role === "owner" || role === "admin");
        setLoaded(true);
      })
      .catch((err) => live && setNote({ text: errorText(err), good: false }));
    return () => {
      live = false;
    };
  }, [organizationId]);

  const changed =
    reviewUrl.trim() !== saved.reviewUrl || reward.trim() !== saved.reward;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const perks = await organizationsAPI.setPerks(organizationId, {
        reviewUrl: reviewUrl.trim() || undefined,
        referralReward: reward.trim() || undefined,
      });
      const next = {
        reviewUrl: perks?.reviewUrl ?? "",
        reward: perks?.referralReward ?? "",
      };
      setReviewUrl(next.reviewUrl);
      setReward(next.reward);
      setSaved(next);
      setNote({ text: "Saved.", good: true });
    } catch (err) {
      setNote({ text: errorText(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#1A1A1A] rounded-lg p-6" data-testid="client-perks">
      <h2 className="text-lg font-semibold text-white mb-1">After the job</h2>
      <p className="text-sm text-gray-400 mb-4">
        Once a client signs the job-complete sign-off, their portal turns into
        their home file: the warranty with its end date and a button to ask for
        warranty service. Add these and it also thanks them with a review ask
        and a referral link.
      </p>
      {!loaded ? (
        <p className="text-sm text-gray-500">{note?.text ?? "Loading…"}</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <label className="block">
            <span className="block text-sm text-gray-300 mb-1">
              Review link
            </span>
            <input
              type="text"
              inputMode="url"
              autoCapitalize="none"
              value={reviewUrl}
              disabled={!canEdit}
              onChange={(e) => setReviewUrl(e.target.value)}
              placeholder="Your Google review link (g.page/r/…)"
              className={input}
            />
            <span className="block text-xs text-gray-500 mt-1">
              In Google Business Profile, tap “Ask for reviews” and copy the
              link. Shows as “How did we do?”
            </span>
          </label>
          <label className="block">
            <span className="block text-sm text-gray-300 mb-1">
              Referral reward
            </span>
            <input
              type="text"
              value={reward}
              maxLength={120}
              disabled={!canEdit}
              onChange={(e) => setReward(e.target.value)}
              placeholder="e.g. a $250 gift card"
              className={input}
            />
            <span className="block text-xs text-gray-500 mt-1">
              What a client gets when a friend they send signs a job. Their
              friends land in Leads marked who sent them; mark the reward given
              on the client’s page.
            </span>
          </label>
          <button
            type="submit"
            disabled={!canEdit || busy || !changed}
            className="px-4 py-2 bg-[#336699] text-white text-sm font-medium rounded hover:bg-[#2A5580] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {!canEdit && (
            <p className="text-sm text-amber-200/90">
              Ask an owner or admin of the company to change these.
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
        </form>
      )}
    </div>
  );
};
