import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Eye, RotateCcw, Upload } from 'lucide-react';
import { useCheckFrames, useDecideShot, getGetProjectQueryKey, getListProjectsQueryKey, type Project, type Shot } from '@workspace/api-client-react';
import { Btn, ErrorBox } from '@/components/kit';
import { ShotGuide } from '@/components/shot-guide';
import { delClip, extractFrames, getClip, listClipIds, putClip } from '@/lib/clips';
import { errInfo } from '@/lib/util';

function ShotCard({ project, shot, index, next, hasLocal, onLocal }: { project: Project; shot: Shot; index: number; next: boolean; hasLocal: boolean; onLocal: (id: string, has: boolean) => void }) {
  const qc = useQueryClient();
  const check = useCheckFrames();
  const decide = useDecideShot();
  const input = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'frames' | 'check'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const sync = (p: Project) => { qc.setQueryData(getGetProjectQueryKey(p.id), p); qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }); };
  const run = async (blob: Blob, name: string) => {
    setErr(null); setPhase('frames');
    try {
      const frames = await extractFrames(blob);
      setPhase('check');
      check.mutate({ id: project.id, data: { shotId: shot.id, frames, clipName: name } }, {
        onSuccess: sync,
        onError: (e) => setErr('AI check failed: ' + errInfo(e).msg + '. Your clip is still saved on this device.'),
        onSettled: () => setPhase('idle'),
      });
    } catch (e) { setPhase('idle'); setErr(e instanceof Error ? e.message : 'Could not read frames from this clip.'); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null); setPhase('frames');
    try {
      // A replacement clip must never inherit approval of the previous footage.
      if (shot.approved || shot.verdict || shot.clipName) {
        const fresh = await decide.mutateAsync({ id: project.id, data: { shotId: shot.id, decision: 'retake' } });
        sync(fresh);
      }
      await putClip(project.id, shot.id, { blob: f, name: f.name });
    } catch (e) { setPhase('idle'); setErr('Could not prepare the replacement clip: ' + errInfo(e).msg); return; }
    onLocal(shot.id, true); setUrl(null);
    run(f, f.name);
  };
  const retry = async () => {
    const c = await getClip(project.id, shot.id);
    if (!c) { setErr('Local clip not found. Upload it again.'); onLocal(shot.id, false); return; }
    run(c.blob, c.name);
  };
  const preview = async () => {
    if (url) { setUrl(null); return; }
    const c = await getClip(project.id, shot.id);
    if (!c) { onLocal(shot.id, false); setErr('Local clip not found on this device.'); return; }
    const u = URL.createObjectURL(c.blob); if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = u; setUrl(u);
  };
  const decision = (d: 'retake' | 'override') => decide.mutate({ id: project.id, data: { shotId: shot.id, decision: d } }, {
    onSuccess: async (p) => { sync(p); if (d === 'retake') { await delClip(project.id, shot.id); onLocal(shot.id, false); setUrl(null); } },
    onError: (e) => setErr(errInfo(e).msg),
  });
  const v = shot.verdict;
  const busy = phase !== 'idle';
  return (
    <li className={`rounded-md border bg-card p-4 transition ${next ? 'border-primary' : 'border-border'}`} data-testid={'card-shoot-' + index}>
      <div className="flex items-start justify-between gap-3">
        <div><span className="font-display text-3xl font-normal text-primary">{String(index + 1).padStart(2, '0')}</span> <span className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">{shot.section} / {shot.type} / {shot.duration}s</span></div>
        {shot.approved ? <span className="font-mono rounded-sm bg-emerald-500/15 px-2 py-1 text-[10px] tracking-[0.04em] text-emerald-400">Approved</span> : !hasLocal && !shot.clipName ? <span className="font-mono rounded-sm bg-destructive/15 px-2 py-1 text-[10px] tracking-[0.04em] text-destructive">Missing</span> : null}
      </div>
      <p className="mt-2 font-normal">{shot.description}</p>
      <p className="mt-1 text-sm text-muted-foreground">{[shot.angle, shot.movement].filter(Boolean).join(' / ')}{shot.props.length ? ' / ' + shot.props.join(', ') : ''}</p>
      <ShotGuide idPrefix={'shoot-' + index} shot={{ description: shot.description, angle: shot.angle, movement: shot.movement, props: shot.props }} />
      {shot.tip && <p className="mt-2 border-l-2 border-primary pl-3 text-sm">{shot.tip}</p>}
      {next && !shot.approved && <p className="font-display mt-3 text-2xl font-normal text-primary" data-testid="text-shoot-next">Recommended next shot</p>}
      {v && (
        <div className={`mt-3 rounded-md border p-3 ${v.match ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-primary/60 bg-primary/10'}`} data-testid={'verdict-' + index}>
          <p className={`font-display text-2xl font-normal ${v.match ? 'text-emerald-400' : 'text-primary'}`}>{v.match ? 'Go ahead' : 'Fix before you move on'} <span className="font-mono text-xs font-normal text-muted-foreground">{Math.round(v.confidence * 100)}%</span></p>
          <p className="mt-1 text-sm">{v.verdict}</p>
          {!v.match && v.fix && <p className="mt-1 text-sm text-primary">Fix: {v.fix}</p>}
        </div>
      )}
      {busy && <p className="font-mono mt-3 flex items-center gap-2 text-xs tracking-[0.04em] text-primary"><span className="rec-dot size-2 rounded-full bg-primary" />{phase === 'frames' ? 'Pulling frames from clip' : 'Director is reviewing'}</p>}
      {err && <div className="mt-3"><ErrorBox msg={err} onRetry={hasLocal ? retry : undefined} /></div>}
      {url && <video src={url} controls playsInline className="mt-3 max-h-80 w-full rounded-md bg-black" data-testid={'video-preview-' + index} />}
      <input ref={input} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" aria-label="Choose a video from your gallery" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} data-testid={'input-clip-' + index} />
      <input ref={cameraInput} type="file" accept="video/*" capture="environment" aria-label="Record a new video" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} data-testid={'input-camera-' + index} />
      <div className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
        <Btn variant={hasLocal ? 'ghost' : 'solid'} disabled={busy} onClick={() => input.current?.click()} data-testid={'button-upload-' + index}><Upload size={16} /> {hasLocal ? 'Replace from gallery' : 'Choose from gallery'}</Btn>
        <Btn variant="line" disabled={busy} onClick={() => cameraInput.current?.click()} data-testid={'button-record-' + index}><Camera size={16} /> Record video</Btn>
        {hasLocal && <Btn variant="ghost" onClick={preview} data-testid={'button-preview-' + index}><Eye size={16} /> {url ? 'Hide' : 'Preview'}</Btn>}
        {hasLocal && !shot.verdict && !busy && <Btn variant="line" onClick={retry} data-testid={'button-check-' + index}>Check with director</Btn>}
        {v && !shot.approved && <Btn variant="ghost" disabled={busy} loading={decide.isPending} onClick={() => decision('override')} data-testid={'button-override-' + index}><Check size={16} /> Approve anyway</Btn>}
        {v && <Btn variant="danger" disabled={busy} loading={decide.isPending} onClick={() => decision('retake')} data-testid={'button-retake-' + index}><RotateCcw size={16} /> Retake</Btn>}
      </div>
    </li>
  );
}

export function ShootPanel({ project }: { project: Project }) {
  const [local, setLocal] = useState<Set<string> | null>(null);
  useEffect(() => { listClipIds(project.id).then((ids) => setLocal(new Set(ids))).catch(() => setLocal(new Set())); }, [project.id]);
  const onLocal = useCallback((id: string, has: boolean) => setLocal((s) => { const n = new Set(s ?? []); if (has) n.add(id); else n.delete(id); return n; }), []);
  if (project.status === 'draft' || project.status === 'planned') return <p className="rounded-md border border-dashed border-white/20 p-8 text-center text-muted-foreground">Approve the plan to unlock shooting.</p>;
  const shots = project.shots;
  const approved = shots.filter((s) => s.approved).length;
  const coverage = project.coverage;
  const percent = coverage?.coverage_pct ?? (shots.length ? Math.round(approved / shots.length * 100) : 0);
  const nextId = coverage ? coverage.next_shot?.slot : shots.find((shot) => !shot.approved)?.id;
  const nextIdx = shots.findIndex((shot) => shot.id === nextId);
  const next = shots[nextIdx];
  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex items-end justify-between"><p className="font-display text-3xl font-normal" data-testid="text-coverage">{percent}% <span className="text-lg text-muted-foreground">coverage</span></p><p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">{approved}/{shots.length} approved</p></div>
        <progress className="mt-3 h-2 w-full accent-primary" aria-label="Shoot coverage" max={100} value={percent} />
        <div className="mt-2 flex gap-1">{shots.map((s) => {
          const slot = coverage?.slots.find((item) => item.slot === s.id);
          const status = slot?.status ?? (s.approved ? 'approved' : s.verdict ? 'needs_fix' : 'missing');
          return <span key={s.id} title={slot?.note ?? status} className={`h-1 flex-1 rounded-sm ${status === 'approved' ? 'bg-emerald-500' : status === 'needs_fix' ? 'bg-primary' : 'bg-muted-foreground/30'}`} />;
        })}</div>
        <p className="mt-2 text-sm" data-testid="text-coverage-status">{coverage?.status ?? 'Keep shooting'}</p>
        <p className="mt-1 text-xs text-muted-foreground" data-testid="text-coverage-source">{coverage?.source === 'agenticorg' ? 'AgenticOrg Coverage Producer' : coverage?.fallback_reason ?? 'Local coverage · based on approved shots'}</p>
        <p className="mt-3 text-xs text-muted-foreground">Clips stay on this device, stored in your browser. Only three still frames per clip are sent for review. Clearing browser data deletes them.</p>
      </div>
      {next && <section className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-4" data-testid="card-shoot-next">
        <p className="font-mono text-xs text-primary">Shoot this next · {String(nextIdx + 1).padStart(2, '0')} / {next.section}</p>
        <h3 className="font-display text-2xl font-normal">{next.description}</h3>
        <p className="text-sm">{coverage?.next_shot?.instruction || next.verdict?.fix || [next.angle, next.movement].filter(Boolean).join(' · ')}</p>
      </section>}
      <ul className="space-y-4">
        {shots.map((s, i) => <ShotCard key={s.id} project={project} shot={s} index={i} next={i === nextIdx} hasLocal={!!local?.has(s.id)} onLocal={onLocal} />)}
      </ul>
    </div>
  );
}
