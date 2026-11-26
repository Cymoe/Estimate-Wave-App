import React, { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { adsAPI, photosAPI } from '../../lib/api';
import { uploadAsset } from '../../lib/adUpload';
import { AD_TRADES, DEFAULT_TRADE } from '../../../convex/lib/ads';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');

/**
 * "Use these photos for ads", for staff on a project's Photos tab: the project's photos go to the ad library as one
 * job, so a story ad can show this job from start to finish. Each photo is copied once; sending again adds only new
 * ones. Claude looks at each and tags it, as with any upload. PDFs stay behind.
 */
export const PhotosForAds: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [trade, setTrade] = useState(DEFAULT_TRADE);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    setDone(null);
    setBusy('Getting the photos…');
    try {
      const { jobId, copied } = await adsAPI.jobForProject(projectId, trade);
      const photos = (await photosAPI.list({ projectId })).filter(
        (p) => p.url && !copied.includes(p.id) && !(p.contentType === 'application/pdf' || p.fileName.toLowerCase().endsWith('.pdf')),
      );
      let sent = 0;
      for (const p of photos) {
        setBusy(`Sending ${sent + 1} of ${photos.length}…`);
        const res = await fetch(p.url!);
        if (!res.ok) throw new Error(`A photo couldn't be read (${res.status})`);
        const blob = await res.blob();
        const file = new File([blob], p.fileName, { type: p.contentType || blob.type });
        await uploadAsset(file, [], trade, undefined, p.caption, { jobId, jobPhotoId: p.id });
        sent += 1;
      }
      setDone(
        sent === 0
          ? copied.length
            ? 'These photos are already in the ad library.'
            : 'No photos to send yet.'
          : `${sent} photo${sent === 1 ? '' : 's'} sent to Ops → Ads → Library as one project. Claude is tagging them; check the before and after.`,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-4 border border-[#2A2A2A] rounded p-3 flex flex-wrap items-center gap-3 text-sm" aria-label="Photos for ads">
      <Megaphone className="w-4 h-4 text-gray-400" aria-hidden="true" />
      <span className="text-gray-300">Use these photos for ads, as one project</span>
      <select
        value={trade}
        onChange={(e) => setTrade(e.target.value)}
        aria-label="Trade for the ads"
        className="bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-sm text-white"
        disabled={busy !== null}
      >
        {Object.values(AD_TRADES).map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => void send()}
        disabled={busy !== null}
        className="px-3 py-1.5 rounded bg-[#336699] text-white text-sm disabled:opacity-60"
      >
        {busy ?? 'Use these photos for ads'}
      </button>
      {done && (
        <p className="w-full text-xs text-emerald-300" role="status">
          {done}
        </p>
      )}
      {error && (
        <p className="w-full text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
