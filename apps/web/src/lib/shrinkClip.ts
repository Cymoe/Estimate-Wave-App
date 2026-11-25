/**
 * A job site clip made small enough to send from a phone: phones shoot 4K, about 100 MB for 20 seconds, which on a
 * phone's connection takes minutes and is often cut off before it finishes. Ads are 1080 x 1920 at most, so the clip
 * is made again at 1080p (its long side 1920) in H.264 with AAC sound, by the device's own video encoder (WebCodecs,
 * through mediabunny): usually faster than the clip plays, and about a tenth of the size.
 *
 * Only clips over SHRINK_ABOVE_BYTES come here (lib/adUpload.ts). Sound that can't be read here (Spatial Audio) is
 * left off. A browser without WebCodecs, or anything that goes wrong: the clip goes up as it was.
 */
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny';

/** The long side of a shrunk clip, the most an ad uses. */
const LONG_SIDE = 1920;
/** About 4 Mbps: clean 1080p for an ad on a phone, about 30 MB a minute. */
const VIDEO_BITRATE = 4_000_000;
/** The most frames a second an ad needs: a 60 fps clip is made at 30, half the work and half the size. */
const MAX_FPS = 30;

/** An even number of pixels, as video encoders want. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function shrinkClip(file: File, onProgress?: (fraction: number) => void, onNote?: (note: string) => void): Promise<File> {
  if (typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'undefined') {
    onNote?.('no WebCodecs VideoEncoder in this browser');
    return file;
  }
  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const convert = async (withSound: boolean) => {
      const target = new BufferTarget();
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
      const conversion = await Conversion.init({
        input,
        output,
        video: async (track) => {
          const w = track.displayWidth;
          const h = track.displayHeight;
          const scale = Math.min(1, LONG_SIDE / Math.max(w, h));
          // Its frame rate, from its first frames: only a faster one is brought down.
          const fps = await track
            .computePacketStats(120)
            .then((st) => st.averagePacketRate)
            .catch(() => 0);
          return {
            width: even(w * scale),
            height: even(h * scale),
            fit: 'contain',
            codec: 'avc',
            bitrate: VIDEO_BITRATE,
            ...(fps > MAX_FPS + 1 ? { frameRate: MAX_FPS } : {}),
          };
        },
        // The sound as it was (a phone records AAC, which an MP4 holds as is): the crew's words become captions.
        audio: withSound ? {} : { discard: true },
      });
      return { target, conversion };
    };
    let { target, conversion } = await convert(true);
    const hasSound = (await input.getAudioTracks()).length > 0;
    const keptSound = conversion.utilizedTracks.some((t) => t.type === 'audio');
    // A clip whose only sound can't be read here (an iPhone's Spatial Audio, Apple's own format, which nothing
    // after this can read either) is made smaller without it, rather than sent at full size or not at all.
    if (hasSound && !keptSound) {
      onNote?.(`sound left off: ${conversion.discardedTracks.map((d) => `${d.track.type} ${d.reason}`).join(', ')}`);
      ({ target, conversion } = await convert(false));
    }
    if (!conversion.isValid) {
      onNote?.(`not converted: ${conversion.discardedTracks.map((d) => `${d.track.type} ${d.reason}`).join(', ') || 'invalid'}`);
      return file;
    }
    if (onProgress) conversion.onProgress = (p) => onProgress(Math.min(1, Math.max(0, p)));
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer || buffer.byteLength === 0 || buffer.byteLength >= file.size) {
      onNote?.(`converted but not smaller (${buffer?.byteLength ?? 0} bytes)`);
      return file;
    }
    onNote?.(`made smaller: ${file.size} → ${buffer.byteLength} bytes`);
    return new File([buffer], file.name.replace(/\.[a-z0-9]+$/i, '') + '.mp4', { type: 'video/mp4' });
  } catch (err) {
    // The clip goes up as it was; the size check after says so if it's too big.
    console.warn('shrinking the clip failed; sending it as it is', err);
    onNote?.(`failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
    return file;
  }
}
