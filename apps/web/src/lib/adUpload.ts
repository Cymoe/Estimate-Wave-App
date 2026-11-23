import { adsAPI } from './api';

// Putting a photo or clip in the ad library (Ops → Ads): the file, and a JPEG still made here in the browser.
// Used by the library itself and by a project's "Use these photos for ads".

const isVideo = (file: File) => file.type.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(file.name);

/** Waits for a media element event, or gives up after a few seconds. */
const once = (el: HTMLElement, event: string, ms: number = 8000) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    el.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
    el.addEventListener('error', () => (clearTimeout(timer), reject(new Error('unreadable'))), { once: true });
  });

/**
 * A JPEG still of a photo or clip, made here in the browser: what Claude
 * looks at, what an iPhone HEIC photo renders from, and a video ad's poster.
 * Videos also give their length. Nothing comes back where the browser
 * can't draw it; the file still uploads.
 */
async function makeStill(file: File): Promise<{ still?: Blob; durationSec?: number }> {
  if (typeof createImageBitmap !== 'function') return {};
  const src = URL.createObjectURL(file);
  try {
    if (isVideo(file)) return await stillOfClip(src);
    const bitmap = await createImageBitmap(file);
    return { still: (await toJpeg(bitmap, bitmap.width, bitmap.height)) ?? undefined };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** A frame drawn to a JPEG, no wider or taller than 1600 pixels. */
async function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  if (!width || !height) return null;
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

/**
 * A still from a clip, and its length. iPhones and iPads hand over a frame only from a video that is set to play
 * inline, has been told to load, and has actually decoded one; a hidden video never playing gives a black frame
 * or none. So: load, wait for its size, seek a moment in, and if no frame came, play it silently for an instant.
 * A clip from the library (`remote`) is read across origins, so the canvas may use it.
 */
export async function stillOfClip(src: string, remote = false): Promise<{ still?: Blob; durationSec?: number }> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.preload = 'auto';
  if (remote) video.crossOrigin = 'anonymous';
  // On the page but out of sight: some browsers decode nothing for a video that isn't.
  Object.assign(video.style, { position: 'fixed', left: '-10000px', top: '0', width: '2px', height: '2px', opacity: '0' });
  document.body.appendChild(video);
  try {
    video.src = src;
    video.load();
    await once(video, 'loadedmetadata', 15000);
    const durationSec = Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : undefined;
    video.currentTime = Math.min(1, (video.duration || 2) / 2);
    try {
      await once(video, 'seeked', 8000);
    } catch {
      // No seek without a decoded frame on some phones: play an instant to get one.
    }
    if (video.readyState < 2) {
      await video.play().catch(() => undefined);
      await once(video, 'timeupdate', 8000).catch(() => undefined);
      video.pause();
    }
    const still = await toJpeg(video, video.videoWidth, video.videoHeight);
    return { still: still ?? undefined, durationSec };
  } finally {
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

export async function putFile(body: Blob, type: string): Promise<string> {
  const url = await adsAPI.uploadUrl();
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': type || 'application/octet-stream' }, body });
  if (!res.ok) throw new Error(`The upload failed (${res.status})`);
  return ((await res.json()) as { storageId: string }).storageId;
}

/**
 * Uploads a file and its still to Convex storage and files it in the library with its tags; under a job when one
 * is given, and with the project photo it was copied from, so that photo isn't sent twice.
 */
export async function uploadAsset(
  file: File,
  tags: string[],
  trade: string,
  pairKey?: string,
  note?: string,
  job?: { jobId?: string; jobPhotoId?: string },
) {
  const { still, durationSec } = await makeStill(file);
  const storageId = await putFile(file, file.type);
  const posterStorageId = still ? await putFile(still, 'image/jpeg') : undefined;
  await adsAPI.addAsset({ storageId, fileName: file.name, tags, pairKey, note, durationSec, posterStorageId, trade, ...job });
}
