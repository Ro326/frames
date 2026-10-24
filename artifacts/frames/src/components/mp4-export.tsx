import { useEffect, useRef, useState } from 'react';
import { Download, Film, X } from 'lucide-react';
import type { Project } from '@workspace/api-client-react';
import { Btn, ErrorBox, Field, inputCls } from './kit';
import { EXPORT_FORMATS, type ExportFormat } from '@/lib/mp4-settings';
import { slugify } from '@/lib/util';
import type { ExportProgress } from '@/lib/export-mp4';

export function Mp4Export({ project }: { project: Project }) {
  const [format, setFormat] = useState<ExportFormat>('portrait');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; format: ExportFormat } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const outputUrl = useRef<string | null>(null);
  const mounted = useRef(true);
  const busy = progress !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const render = async () => {
    if (controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setError(null);
    setProgress({ percent: 0, label: 'Preparing the export…' });
    try {
      const { exportProjectMp4 } = await import('@/lib/export-mp4');
      const blob = await exportProjectMp4(project, format, {
        signal: job.signal,
        onProgress: (value) => { if (mounted.current) setProgress(value); },
      });
      if (!mounted.current || job.signal.aborted) return;
      if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
      outputUrl.current = URL.createObjectURL(blob);
      setPreviewError(false);
      setResult({ url: outputUrl.current, format });
    } catch (e) {
      if (mounted.current) setError(job.signal.aborted
        ? 'Export cancelled. Your source clips are unchanged.'
        : e instanceof Error ? e.message : 'Export failed. Your original clips are unchanged.');
    } finally {
      controller.current = null;
      if (mounted.current) setProgress(null);
    }
  };
  return (
    <section className="space-y-4 rounded-md border border-primary/30 bg-card p-4 sm:p-5" data-testid="mp4-export">
      <div className="flex items-center gap-2 text-primary"><Film size={18} /><span className="font-mono text-xs">Finished video</span></div>
      <h3 className="font-display text-3xl font-normal">One MP4, ready to share.</h3>
      <p className="text-sm text-muted-foreground">Approved clips, in shot order, with clean cuts and their original audio. Each starts at the beginning and is trimmed to its planned length; shorter clips use their available length. Clips without audio stay silent.</p>
      <Field label="Output format" hint="720p · 30 fps · fit with black padding where needed, never crop">
        <select value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as ExportFormat)} className={inputCls} data-testid="select-mp4-format">
          {Object.entries(EXPORT_FORMATS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
      </Field>
      <p className="text-xs text-muted-foreground">Rendered on this device—no footage uploads or AI-generation calls. First use downloads a video engine (about 31 MB). Up to 250 MB of source clips per export. Keep this tab open; larger videos can take several minutes.</p>
      {progress && <div className="space-y-2" role="status" aria-live="polite" data-testid="mp4-progress">
        <div className="flex justify-between gap-2 text-sm"><span>{progress.label}</span><span>{Math.floor(progress.percent)}%</span></div>
        <progress value={progress.percent} max={100} aria-label="MP4 export progress" className="h-2 w-full accent-primary" />
      </div>}
      {error && <ErrorBox msg={error} />}
      <div className="flex flex-wrap gap-2">
        <Btn onClick={render} loading={busy} className="flex-1" data-testid="button-export-mp4"><Film size={17} />{result ? 'Render again' : 'Create finished MP4'}</Btn>
        {busy && <Btn variant="line" onClick={() => controller.current?.abort()} data-testid="button-cancel-mp4"><X size={16} />Cancel</Btn>}
      </div>
      {result && <div className="space-y-3 border-t border-border pt-4" data-testid="mp4-result">
        <p className="text-sm text-emerald-400">Your MP4 is ready · {EXPORT_FORMATS[result.format].label}</p>
        <video src={result.url} controls playsInline preload="metadata" onError={() => setPreviewError(true)} onLoadedMetadata={() => setPreviewError(false)} className="max-h-[440px] w-full rounded-md bg-black" data-testid="video-finished-mp4" />
        {previewError && <p className="text-sm text-muted-foreground" role="status" data-testid="text-mp4-preview-unavailable">This browser cannot preview the MP4. The finished file is still available below—download it and play it in your phone’s video player.</p>}
        <a href={result.url} download={`${slugify(project.title)}_frames.mp4`} className="tap inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-foreground px-5 text-sm font-normal text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="link-download-mp4"><Download size={17} />Download finished MP4</a>
        <p className="text-xs text-muted-foreground">Download before leaving this page. Original clips remain in your browser; keep the ZIP as a backup if needed.</p>
      </div>}
    </section>
  );
}
