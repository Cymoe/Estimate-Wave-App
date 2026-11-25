/**
 * A job site clip made small enough to send from a phone: phones shoot 4K, about 100 MB for 20 seconds, which on a
 * phone's connection takes minutes and is often cut off before it finishes. Ads are 1080 x 1920 at most, so the clip
 * is made again at 1080p (its long side 1920) in H.264 with AAC sound, by the device's own video encoder (WebCodecs,
 * through mediabunny): usually faster than the clip plays, and about a tenth of the size.
 *
 * Only clips over SHRINK_ABOVE_BYTES come here (lib/adUpload.ts). A browser without WebCodecs, a clip whose sound
 * would be lost, or anything that goes wrong: the clip goes up as it was.
 */
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny';

/** The long side of a shrunk clip, the most an ad uses. */
const LONG_SIDE = 1920;
/** About 6 Mbps: clean 1080p for an ad, about 45 MB a minute. */
const VIDEO_BITRATE = 6_000_000;

/** An even number of pixels, as video encoders want. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function shrinkClip(file: File, onProgress?: (fraction: number) => void): Promise<File> {
  if (typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'undefined') return file;
  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const conversion = await Conversion.init({
      input,
      output,
      video: (track) => {
        const w = track.displayWidth;
        const h = track.displayHeight;
        const scale = Math.min(1, LONG_SIDE / Math.max(w, h));
        return { width: even(w * scale), height: even(h * scale), fit: 'contain', codec: 'avc', bitrate: VIDEO_BITRATE };
      },
      // The sound as it was (a phone records AAC, which an MP4 holds as is): the crew's words become captions.
      audio: {},
    });
    // A clip whose sound would be lost goes as it was: its words are what the captions are made from.
    if (!conversion.isValid || conversion.discardedTracks.some((d) => d.track.type === 'audio')) return file;
    if (onProgress) conversion.onProgress = (p) => onProgress(Math.min(1, Math.max(0, p)));
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer || buffer.byteLength === 0 || buffer.byteLength >= file.size) return file;
    return new File([buffer], file.name.replace(/\.[a-z0-9]+$/i, '') + '.mp4', { type: 'video/mp4' });
  } catch (err) {
    // The clip goes up as it was; the size check after says so if it's too big.
    console.warn('shrinking the clip failed; sending it as it is', err);
    return file;
  }
}
