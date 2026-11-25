import { adsAPI } from './api';

// Putting a photo or clip in the ad library (Ops → Ads): the file, and a JPEG still made here in the browser.
// Used by the library itself and by a project's "Use these photos for ads".

export const isVideo = (file: File) => file.type.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(file.name);

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

/** A frame drawn to a JPEG, no wider or taller than `max` pixels (1600 for a still). */
async function toJpeg(source: CanvasImageSource, width: number, height: number, max = 1600, quality = 0.85): Promise<Blob | null> {
  if (!width || !height) return null;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** How big a library thumbnail is: enough for a card on an iPad's sharp screen, a few dozen KB. */
const THUMB = 480;

/** The small copy of an image (a still, or the photo itself) the library grid shows. Nothing where it can't be drawn. */
export async function thumbOf(image: Blob): Promise<Blob | undefined> {
  if (typeof createImageBitmap !== 'function') return undefined;
  try {
    const bitmap = await createImageBitmap(image);
    return (await toJpeg(bitmap, bitmap.width, bitmap.height, THUMB, 0.8)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Makes the small copy for a file already in the library, from its still or the photo: for files uploaded before
 * thumbnails were made. Quiet: a file it can't read is left as it is.
 */
export async function backfillThumb(id: string, imageUrl: string): Promise<boolean> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return false;
    const thumb = await thumbOf(await res.blob());
    if (!thumb) return false;
    await adsAPI.setThumb(id, await putFile(thumb, 'image/jpeg'));
    return true;
  } catch {
    return false;
  }
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

/** Clips bigger than this are made smaller before sending (lib/shrinkClip.ts); smaller ones send quickly enough. */
export const SHRINK_ABOVE_BYTES = 25 * 1024 * 1024;
/** The largest files the library takes (convex/ads.ts addAsset checks the same). */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** How long one file may take to send before it's called stuck. */
const SEND_TIMEOUT_MS = 15 * 60 * 1000;
const STOPPED =
  'The upload stopped before it finished: the connection dropped or it took too long. On Wi-Fi it goes faster; a shorter clip helps too.';

/**
 * Sends a file to storage. With onProgress it goes by XMLHttpRequest, which says how far along it is (a clip can
 * take minutes on a phone's connection) and says so when the connection drops, instead of hanging.
 */
export async function putFile(body: Blob, type: string, onProgress?: (fraction: number) => void): Promise<string> {
  const url = await adsAPI.uploadUrl();
  if (!onProgress || typeof XMLHttpRequest === 'undefined') {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': type || 'application/octet-stream' }, body });
    if (!res.ok) throw new Error(`The upload failed (${res.status})`);
    return ((await res.json()) as { storageId: string }).storageId;
  }
  return await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', type || 'application/octet-stream');
    xhr.timeout = SEND_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`The upload failed (${xhr.status})`));
      try {
        resolve((JSON.parse(xhr.responseText) as { storageId: string }).storageId);
      } catch {
        reject(new Error(STOPPED));
      }
    };
    xhr.onerror = () => reject(new Error(STOPPED));
    xhr.ontimeout = () => reject(new Error(STOPPED));
    xhr.onabort = () => reject(new Error(STOPPED));
    xhr.send(body);
  });
}

/** The browser and device, briefly, for upload notes. */
const deviceName = () => (typeof navigator !== 'undefined' ? navigator.userAgent : '');

/** How many times a send is tried before it's given up: a phone's connection drops now and then. */
const SEND_TRIES = 3;

/**
 * A file sent, tried again (with a fresh upload address) when the connection drops: on a phone's connection one
 * drop shouldn't lose a clip. Each stop is noted in the deployment's logs.
 */
async function sendWithRetries(file: File, onProgress?: (fraction: number) => void): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await putFile(file, file.type, onProgress);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      void adsAPI.uploadNote({ fileName: file.name, size: file.size, step: `send ${attempt}/${SEND_TRIES}`, note: why, device: deviceName() });
      if (attempt >= SEND_TRIES || !/stopped before it finished|failed \(5\d\d\)/.test(why)) throw err;
      onProgress?.(0);
      await new Promise((r) => setTimeout(r, process.env.NODE_ENV === 'test' ? 0 : attempt * 2000));
    }
  }
}

/** A file too big for the library, said before anything is sent; null when it fits. */
export function tooBig(file: File): string | null {
  const mb = (n: number) => Math.round(n / (1024 * 1024));
  if (isVideo(file) && file.size > MAX_VIDEO_BYTES)
    return `${file.name} is ${mb(file.size)} MB and couldn't be made smaller on this device. A clip must be ${mb(MAX_VIDEO_BYTES)} MB or less: trim it into shorter clips.`;
  if (!isVideo(file) && file.size > MAX_PHOTO_BYTES) return `${file.name} is ${mb(file.size)} MB. A photo must be ${mb(MAX_PHOTO_BYTES)} MB or less.`;
  return null;
}

/** A file made ready to send: the clip made smaller, its still and small copy. */
export interface PreparedAsset {
  file: File;
  /** The file as it was picked, for notes. */
  picked: { name: string; size: number };
  still?: Blob;
  thumb?: Blob | null;
  durationSec?: number;
}

const seconds = (since: number) => Math.round((performance.now() - since) / 100) / 10;

/**
 * Step one of an upload, all on the device: a big clip made again at 1080p (lib/shrinkClip.ts, loaded only then:
 * the video code is large), the size checked, its still and the grid's small copy made from what will be sent.
 * Throws when the file is too big even so.
 */
export async function prepareAsset(file: File, onProgress?: (fraction: number) => void): Promise<PreparedAsset> {
  const picked = { name: file.name, size: file.size };
  // The iPad sometimes stops letting the page read a picked file (after leaving the page a while): said plainly.
  const head = file.slice(0, 1);
  if (typeof head.arrayBuffer === 'function') {
    try {
      await head.arrayBuffer();
    } catch {
      throw new Error(`The iPad didn't let the page read ${file.name} any more. Pick it again.`);
    }
  }
  if (isVideo(file) && file.size > SHRINK_ABOVE_BYTES) {
    onProgress?.(0);
    const { shrinkClip } = await import('./shrinkClip');
    const t = performance.now();
    file = await shrinkClip(
      file,
      (x) => onProgress?.(x),
      (note) => void adsAPI.uploadNote({ fileName: picked.name, size: picked.size, step: 'shrink', note, device: deviceName() }),
    );
    void adsAPI.uploadNote({ fileName: picked.name, size: picked.size, step: 'shrink time', note: `${seconds(t)} s, now ${file.size} bytes`, device: deviceName() });
  }
  const big = tooBig(file);
  if (big) throw new Error(big);
  const { still, durationSec } = await makeStill(file);
  // The grid's small copy, from the still (or the photo where no still could be made).
  const thumb = await thumbOf(still ?? file);
  return { file, picked, still, thumb, durationSec };
}

/** Step two: the prepared file, its still and small copy sent, and filed in the library. */
export async function sendPreparedAsset(
  p: PreparedAsset,
  meta: { tags: string[]; trade: string; pairKey?: string; note?: string; job?: { jobId?: string; jobPhotoId?: string } },
  onProgress?: (fraction: number) => void,
) {
  const t = performance.now();
  const storageId = await sendWithRetries(p.file, onProgress);
  const took = seconds(t);
  if (isVideo(p.file))
    void adsAPI.uploadNote({
      fileName: p.picked.name,
      size: p.file.size,
      step: 'send time',
      note: `${took} s, ${took > 0 ? Math.round((p.file.size / 1048576 / took) * 10) / 10 : '?'} MB/s`,
      device: deviceName(),
    });
  const posterStorageId = p.still ? await putFile(p.still, 'image/jpeg') : undefined;
  const thumbStorageId = p.thumb ? await putFile(p.thumb, 'image/jpeg') : undefined;
  await adsAPI.addAsset({
    storageId,
    fileName: p.file.name,
    tags: meta.tags,
    pairKey: meta.pairKey,
    note: meta.note,
    durationSec: p.durationSec,
    posterStorageId,
    thumbStorageId,
    trade: meta.trade,
    ...meta.job,
  });
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
  onProgress?: (fraction: number, step: 'shrinking' | 'sending') => void,
) {
  const prepared = await prepareAsset(file, onProgress && ((x) => onProgress(x, 'shrinking')));
  await sendPreparedAsset(prepared, { tags, trade, pairKey, note, job }, onProgress && ((x) => onProgress(x, 'sending')));
}
