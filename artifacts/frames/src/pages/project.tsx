import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useGetProject, useDirectProject, getGetProjectQueryKey, getListProjectsQueryKey } from '@workspace/api-client-react';
import { Btn, ErrorBox, Shell, Skel } from '@/components/kit';
import { PlanEditor } from '@/components/plan-editor';
import { ShootPanel } from '@/components/shoot-panel';
import { EditPanel } from '@/components/edit-panel';
import { UpgradeButton } from '@/components/upgrade-button';
import { errInfo, fmtDur } from '@/lib/util';

type Tab = 'plan' | 'shoot' | 'edit';

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const qc = useQueryClient();
  const q = useGetProject(id, { query: { enabled: Number.isFinite(id), queryKey: getGetProjectQueryKey(id), refetchOnWindowFocus: true } });
  const direct = useDirectProject();
  const [tab, setTab] = useState<Tab | null>(null);
  const p = q.data;
  const previousDirectorError = qc.getQueryData<string>(['director-error', id]);

  if (q.isLoading) return <Shell><Skel className="mb-4 h-14 w-2/3" /><Skel className="h-80" /></Shell>;
  if (q.isError || !p) return <Shell><ErrorBox msg={q.isError ? errInfo(q.error).msg : 'Project not found'} onRetry={() => q.refetch()} /></Shell>;

  const active: Tab = tab ?? (p.status === 'complete' ? 'edit' : p.status === 'shooting' ? 'shoot' : 'plan');
  const tabs: { k: Tab; l: string }[] = [{ k: 'plan', l: 'Plan' }, { k: 'shoot', l: 'Shoot' }, { k: 'edit', l: 'Edit' }];
  const runDirect = () => {
    if (direct.isPending) return;
    qc.removeQueries({ queryKey: ['director-error', id], exact: true });
    direct.mutate({ id }, { onSuccess: (d) => { qc.setQueryData(getGetProjectQueryKey(id), d); qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }); } });
  };
  const needsDirect = p.shots.length === 0 && !p.manual;

  return (
    <Shell>
      <Link href="/studio" data-testid="link-back" className="tap mb-4 inline-flex min-h-12 items-center gap-2 font-mono text-xs tracking-[0.04em] text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Studio</Link>
      <h1 className="font-display text-4xl font-normal leading-[1.05] sm:text-4xl" data-testid="text-project-title">{p.title}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{p.brief}</p>
      <p className="font-mono mt-2 text-[11px] tracking-[0.04em] text-primary">{p.niche} / {fmtDur(p.targetLength)} / {p.vibe} / {p.status}</p>
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 mt-6 mb-6 flex border-b border-border bg-background/90 px-4 backdrop-blur" role="tablist">
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={active === t.k} data-testid={'tab-' + t.k} onClick={() => setTab(t.k)} className={`tap relative min-h-14 flex-1 font-display text-2xl font-normal tracking-[0.04em]r transition-colors ${active === t.k ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.l}
            {active === t.k && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
          </button>
        ))}
      </div>
      {active === 'plan' && (
        <>
          <div className="mb-5"><UpgradeButton testId="button-plan-pro" /></div>
          {needsDirect && (
            <div className="mb-6 space-y-3 rounded-md border border-primary/40 bg-primary/10 p-4">
              <p className="font-normal">No shot list yet.</p>
              <p className="text-sm text-muted-foreground">Ask the AI director to plan this shoot, or add shots by hand below.</p>
              {(direct.isError || previousDirectorError) && !direct.isPending && <ErrorBox msg={direct.isError ? errInfo(direct.error).msg : previousDirectorError!} onRetry={runDirect} />}
              <Btn loading={direct.isPending} onClick={runDirect} data-testid="button-direct"><Sparkles size={16} /> {direct.isPending ? 'Planning your shots…' : 'Direct my shoot'}</Btn>
              {direct.isPending && <p role="status" className="text-sm text-muted-foreground">This can take about 30 seconds. Keep this page open.</p>}
            </div>
          )}
          <PlanEditor key={p.id + ':' + p.status + ':' + p.shots.length + ':' + (p.approvedAt ?? '')} project={p} />
        </>
      )}
      {active === 'shoot' && <ShootPanel project={p} />}
      {active === 'edit' && <EditPanel project={p} />}
    </Shell>
  );
}
