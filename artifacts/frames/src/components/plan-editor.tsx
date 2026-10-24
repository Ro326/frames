import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react';
import { useUpdateProject, useApprovePlan, getGetProjectQueryKey, getListProjectsQueryKey, type Project, type Shot } from '@workspace/api-client-react';
import { Btn, ErrorBox, Field, inputCls } from '@/components/kit';
import { errInfo } from '@/lib/util';

function PropsInput({ value, disabled, onCommit }: { value: string[]; disabled: boolean; onCommit: (v: string[]) => void }) {
  const [t, setT] = useState(value.join(', '));
  return <input disabled={disabled} className={inputCls} value={t} onChange={(e) => setT(e.target.value)} onBlur={() => onCommit(t.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="tripod, ND filter" />;
}

const newShot = (): Shot => ({
  id: crypto.randomUUID(), section: 'Body', description: '', angle: '', movement: 'Static', type: 'B-roll', props: [], duration: 5, tip: '', approved: false,
});

export function PlanEditor({ project }: { project: Project }) {
  const qc = useQueryClient();
  const update = useUpdateProject();
  const approve = useApprovePlan();
  const locked = project.status === 'shooting' || project.status === 'complete';
  const [shots, setShots] = useState<Shot[]>(project.shots);
  const [voice, setVoice] = useState(project.voiceover);
  const [check, setCheck] = useState(project.checklist.join('\n'));
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const patch = (i: number, p: Partial<Shot>) => { setShots((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x))); setDirty(true); setSaved(false); };
  const move = (i: number, d: number) => setShots((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const body = () => ({ shots, voiceover: voice, checklist: check.split('\n').map((l) => l.trim()).filter(Boolean) });
  const valid = shots.length > 0 && shots.every((s) => s.description.trim().length > 0 && s.duration >= 1 && s.duration <= 600);

  const done = (p: Project) => { qc.setQueryData(getGetProjectQueryKey(p.id), p); qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }); };
  const save = (then?: () => void) => {
    setErr(null);
    update.mutate({ id: project.id, data: body() }, {
      onSuccess: (p) => { done(p); setDirty(false); setSaved(true); then?.(); },
      onError: (e) => setErr(errInfo(e).msg),
    });
  };
  const lock = () => approve.mutate({ id: project.id }, { onSuccess: done, onError: (e) => setErr(errInfo(e).msg) });
  const busy = update.isPending || approve.isPending;

  return (
    <div className="space-y-6">
      {locked && <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary"><Lock size={16} /> Plan is approved and locked. Head to Shoot.</div>}
      <ol className="space-y-4">
        {shots.map((s, i) => (
          <li key={s.id} className="rounded-md border border-border bg-card p-4" data-testid={'card-shot-' + i}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-primary">{String(i + 1).padStart(2, '0')}</span>
              {!locked && <div className="flex gap-1">
                <button aria-label="Move up" data-testid={'button-up-' + i} disabled={i === 0} onClick={() => { move(i, -1); setDirty(true); }} className="tap grid size-12 place-items-center rounded-md bg-secondary disabled:opacity-30"><ArrowUp size={18} /></button>
                <button aria-label="Move down" data-testid={'button-down-' + i} disabled={i === shots.length - 1} onClick={() => { move(i, 1); setDirty(true); }} className="tap grid size-12 place-items-center rounded-md bg-secondary disabled:opacity-30"><ArrowDown size={18} /></button>
                <button aria-label="Delete shot" data-testid={'button-delete-' + i} onClick={() => { setShots((x) => x.filter((_, j) => j !== i)); setDirty(true); }} className="tap grid size-12 place-items-center rounded-md bg-destructive/15 text-destructive"><Trash2 size={18} /></button>
              </div>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Section"><select disabled={locked} className={inputCls} value={s.section} onChange={(e) => patch(i, { section: e.target.value as Shot['section'] })} data-testid={'select-section-' + i}>{['Intro', 'Body', 'Outro'].map((o) => <option key={o}>{o}</option>)}</select></Field>
              <Field label="Type"><select disabled={locked} className={inputCls} value={s.type} onChange={(e) => patch(i, { type: e.target.value as Shot['type'] })} data-testid={'select-type-' + i}>{['A-roll', 'B-roll'].map((o) => <option key={o}>{o}</option>)}</select></Field>
              <div className="sm:col-span-2"><Field label="Description"><textarea disabled={locked} rows={2} maxLength={2000} className={inputCls + ' py-3'} value={s.description} onChange={(e) => patch(i, { description: e.target.value })} data-testid={'input-description-' + i} /></Field></div>
              <Field label="Angle"><input disabled={locked} className={inputCls} value={s.angle} onChange={(e) => patch(i, { angle: e.target.value })} data-testid={'input-angle-' + i} /></Field>
              <Field label="Movement"><input disabled={locked} className={inputCls} value={s.movement} onChange={(e) => patch(i, { movement: e.target.value })} data-testid={'input-movement-' + i} /></Field>
              <Field label="Duration (sec)"><input disabled={locked} type="number" min={1} max={600} className={inputCls} value={s.duration} onChange={(e) => patch(i, { duration: Number(e.target.value) })} data-testid={'input-duration-' + i} /></Field>
              <Field label="Props (comma separated)"><PropsInput value={s.props} disabled={locked} onCommit={(v) => patch(i, { props: v })} /></Field>
              <div className="sm:col-span-2"><Field label="Director's tip"><input disabled={locked} className={inputCls} value={s.tip} onChange={(e) => patch(i, { tip: e.target.value })} data-testid={'input-tip-' + i} /></Field></div>
            </div>
          </li>
        ))}
      </ol>
      {!locked && <Btn variant="line" className="w-full" onClick={() => { setShots((s) => [...s, newShot()]); setDirty(true); }} data-testid="button-add-shot"><Plus size={18} /> Add shot</Btn>}
      <Field label="Voiceover script"><textarea disabled={locked} rows={6} maxLength={15000} className={inputCls + ' py-3'} value={voice} onChange={(e) => { setVoice(e.target.value); setDirty(true); }} data-testid="input-voiceover" /></Field>
      <Field label="Checklist (one per line)"><textarea disabled={locked} rows={5} className={inputCls + ' py-3'} value={check} onChange={(e) => { setCheck(e.target.value); setDirty(true); }} data-testid="input-checklist" /></Field>
      {err && <ErrorBox msg={err} />}
      {!locked && (
        <div className="sticky bottom-3 z-30 flex flex-col gap-2 rounded-md border border-border bg-background/95 p-3 backdrop-blur sm:flex-row">
          <Btn variant="ghost" className="flex-1" loading={update.isPending} disabled={!dirty || !valid || busy} onClick={() => save()} data-testid="button-save-plan">{saved && !dirty ? 'Saved' : 'Save plan'}</Btn>
          <Btn className="flex-1" loading={approve.isPending} disabled={!valid || busy} onClick={() => (dirty ? save(lock) : lock())} data-testid="button-approve-plan"><Lock size={16} /> Approve and start shooting</Btn>
        </div>
      )}
    </div>
  );
}
