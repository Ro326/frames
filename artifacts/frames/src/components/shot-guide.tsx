import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, Pause, Play, RotateCcw } from 'lucide-react';
import { resolveShotGuide, type GuideCue } from '@/lib/shot-guides';
import { Diagram } from '@/components/shot-guide-diagram';

type ShotIn = { description: string; angle: string; movement: string; props?: string[] };
type Tab = 'angle' | 'movement' | 'framing';

export function ShotGuide({ shot, idPrefix = 'shot' }: { shot: ShotIn; idPrefix?: string }) {
  const uid = useId();
  const id = `${idPrefix}-${uid.replace(/:/g, '')}`;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('angle');
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0);
  const g = useMemo(() => (open ? resolveShotGuide({ description: shot.description, angle: shot.angle, movement: shot.movement, props: shot.props }) : null), [open, shot.description, shot.angle, shot.movement, shot.props]);
  const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toggle = () => { if (!open) { setPlaying(!reduced()); setRun((r) => r + 1); } setOpen(!open); };
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => { if (mq.matches) setPlaying(false); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [open]);
  const activeTab: Tab = tab === 'framing' && !g?.framing ? 'angle' : tab;

  const tabs: { id: Tab; label: string }[] = [{ id: 'angle', label: 'Where to stand' }, { id: 'movement', label: 'How to move' }];
  if (g?.framing) tabs.push({ id: 'framing', label: 'Framing' });
  const cur: GuideCue | null = g ? (activeTab === 'framing' ? g.framing : g[activeTab]) ?? g.angle : null;
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === activeTab);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const t = tabs[(n + tabs.length) % tabs.length];
    setTab(t.id);
    document.getElementById(`${id}-tab-${t.id}`)?.focus();
  };
  const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  return (
    <div className="mt-3 rounded-md border border-border bg-background/40" data-testid={`shot-guide-${idPrefix}`}>
      <button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={toggle} data-testid={`button-guide-${idPrefix}`}
        className={`tap flex min-h-12 w-full items-center justify-between gap-2 rounded-md px-4 text-left text-sm font-normal text-primary ${ring}`}>
        <span>Show me how</span>
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div id={`${id}-panel`} hidden={!open}>
        {open && g && cur && (
          <div className="space-y-3 px-4 pb-4">
            {g.description && <p className="text-xs text-muted-foreground">For this shot: {g.description}</p>}
            <p className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">Your angle: {shot.angle.trim() || 'not set'} / Your movement: {shot.movement.trim() || 'not set'}</p>
            <div role="tablist" aria-label="Guide sections" onKeyDown={onKey} className="flex flex-wrap gap-1">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" id={`${id}-tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`${id}-tabpanel`} tabIndex={activeTab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)} className={`min-h-10 rounded-md px-3 text-sm font-normal ${ring} ${activeTab === t.id ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>{t.label}</button>
              ))}
            </div>
            <div role="tabpanel" id={`${id}-tabpanel`} aria-labelledby={`${id}-tab-${activeTab}`} className="space-y-3">
              <div key={run + cur.kind + activeTab}>
                <Diagram cue={cur} playing={playing} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">Diagram, not footage</p>
                <div className="flex gap-1">
                  <button type="button" aria-label={playing ? 'Pause diagram' : 'Play diagram'} onClick={() => setPlaying((p) => !p)} className={`tap grid size-10 place-items-center rounded-md bg-secondary ${ring}`}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
                  <button type="button" aria-label="Replay diagram" onClick={() => { setRun((r) => r + 1); setPlaying(true); }} className={`tap grid size-10 place-items-center rounded-md bg-secondary ${ring}`}><RotateCcw size={16} /></button>
                </div>
              </div>
              <div>
                <p className="font-display text-xl font-normal">{cur.title}{cur.advanced && <span className="font-mono ml-2 text-[10px] text-muted-foreground">Advanced</span>}</p>
                <p className="mt-1 text-sm">{cur.instruction}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{cur.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
                {cur.caution && <p className="mt-2 text-sm text-muted-foreground">Watch out: {cur.caution}</p>}
                {cur.alternative && <p className="mt-2 border-l-2 border-primary pl-3 text-sm">Easier option: {cur.alternative}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
