import type { Project } from '@workspace/api-client-react';
import { getClip } from './clips';
import { clipEncodingArgs, concatArgs, MAX_EXPORT_BYTES, type ExportFormat } from './mp4-settings';

export interface ExportProgress { percent: number; label: string }
const cancelled = () => new DOMException('Export cancelled.', 'AbortError');

/**
 * Single-thread FFmpeg in a dedicated worker. No uploads, shared-memory headers,
 * AI requests, or changes to the original IndexedDB clips.
 * Loaded only when the creator starts an MP4 export.
 */
export async function exportProjectMp4(project: Project, format: ExportFormat, options: {
  signal: AbortSignal;
  onProgress: (progress: ExportProgress) => void;
}): Promise<Blob> {
  const { signal, onProgress } = options;
  const check = () => { if (signal.aborted) throw cancelled(); };
  if (!project.shots.length || project.shots.some((shot) => !shot.approved)) {
    throw new Error('Approve every shot before exporting the finished video.');
  }
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    throw new Error('This browser cannot render MP4 locally. Try a recent Safari or Chrome browser, or download the ZIP.');
  }
  check();
  onProgress({ percent: 0, label: 'Checking locally stored clips…' });
  const clips = await Promise.all(project.shots.map((shot) => getClip(project.id, shot.id)));
  const missing = clips.flatMap((clip, i) => clip?.blob.size ? [] : [String(i + 1).padStart(2, '0')]);
  if (missing.length) throw new Error(`Clip missing on this device for shot ${missing.join(', ')}. Re-upload it in Shoot, then export again. Nothing has been changed.`);
  if (clips.reduce((sum, clip) => sum + clip!.blob.size, 0) > MAX_EXPORT_BYTES) {
    throw new Error('This on-device export supports up to 250 MB of source clips. Use smaller clips or download the ZIP to edit elsewhere. Your original clips are unchanged.');
  }
  check();
  onProgress({ percent: 2, label: 'Loading the video renderer (about 31 MB on first use)…' });
  const [{ FFmpeg }, { default: coreURL }, { default: wasmURL }, { default: classWorkerURL }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/core?url'),
    import('@ffmpeg/core/wasm?url'),
    import('@ffmpeg/ffmpeg/worker?worker&url'),
  ]);
  check();
  const engine = new FFmpeg();
  const abort = () => engine.terminate();
  signal.addEventListener('abort', abort, { once: true });
  let loading = true;
  let shotIndex = 0;
  let segmentDuration = 1;
  const onEncoderProgress = ({ time }: { time: number }) => {
    const fraction = Math.min(0.99, Math.max(0, time / 1_000_000 / segmentDuration));
    onProgress({
      percent: Math.min(94, 5 + (shotIndex + fraction) / clips.length * 88),
      label: `Rendering shot ${shotIndex + 1} of ${clips.length}…`,
    });
  };
  engine.on('progress', onEncoderProgress);
  try {
    // Assets are served from this app's own base path, never from a third-party CDN.
    await engine.load({ coreURL, wasmURL, classWorkerURL });
    loading = false;
    check();
    const outputs: string[] = [];
    for (shotIndex = 0; shotIndex < clips.length; shotIndex++) {
      check();
      segmentDuration = project.shots[shotIndex]!.duration;
      onProgress({ percent: 5 + shotIndex / clips.length * 88, label: `Rendering shot ${shotIndex + 1} of ${clips.length}…` });
      // Fixed internal filenames: user-supplied filenames never become commands.
      const input = 'source';
      const output = `clip-${shotIndex}.mp4`;
      await engine.writeFile(input, new Uint8Array(await clips[shotIndex]!.blob.arrayBuffer()));
      await engine.ffprobe([
        '-v', 'error', '-show_entries', 'stream=codec_type:format=duration',
        '-of', 'json', '-o', 'probe.json', input,
      ]);
      // This single-thread core can leave ffprobe's return value at -1 even
      // after writing a valid report. Validate the report itself, not that sentinel.
      let probe: {
        streams?: { codec_type?: string }[]; format?: { duration?: string };
      };
      try {
        probe = JSON.parse(await engine.readFile('probe.json', 'utf8') as string) as typeof probe;
      } catch {
        throw new Error(`Shot ${shotIndex + 1} could not be read. Re-export that source clip as MP4 or use the ZIP.`);
      }
      if (!probe.streams?.some((stream) => stream.codec_type === 'video')) {
        throw new Error(`Shot ${shotIndex + 1} has no readable video track.`);
      }
      const sourceDuration = Number(probe.format?.duration);
      if (Number.isFinite(sourceDuration) && sourceDuration > 0) segmentDuration = Math.min(segmentDuration, sourceDuration);
      const hasAudio = probe.streams.some((stream) => stream.codec_type === 'audio');
      const encoded = await engine.exec(clipEncodingArgs(input, output, segmentDuration, hasAudio, format));
      if (encoded !== 0) throw new Error(`Could not render shot ${shotIndex + 1}. Try a smaller source clip. Your originals are safe.`);
      outputs.push(output);
      await engine.deleteFile(input);
      await engine.deleteFile('probe.json');
    }
    check();
    engine.off('progress', onEncoderProgress);
    onProgress({ percent: 95, label: 'Joining the shots into your finished MP4…' });
    await engine.writeFile('clips.txt', new TextEncoder().encode(outputs.map((file) => `file '${file}'`).join('\n')));
    const joined = await engine.exec(concatArgs());
    if (joined !== 0) throw new Error('The shots could not be joined. Your source clips are unchanged; the ZIP is still available.');
    const data = await engine.readFile('finished.mp4');
    check();
    if (!(data instanceof Uint8Array) || data.byteLength < 12 ||
      String.fromCharCode(...data.subarray(4, 8)) !== 'ftyp') {
      throw new Error('The renderer did not produce a valid MP4 file. Download the ZIP instead.');
    }
    // Copy out of WASM before terminating its worker.
    const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
    onProgress({ percent: 100, label: 'Your finished video is ready.' });
    return blob;
  } catch (error) {
    if (signal.aborted) throw cancelled();
    if (error instanceof Error && !loading) throw error;
    throw new Error(loading
      ? 'The video renderer could not load. Check your connection and try again. No clips were uploaded or changed.'
      : 'This device could not finish the render. Close other tabs or try smaller clips, or use the ZIP. Your original clips are safe.');
  } finally {
    signal.removeEventListener('abort', abort);
    engine.terminate();
  }
}
