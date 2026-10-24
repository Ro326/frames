import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Sparkles, PenLine } from 'lucide-react';
import {
  useGetMe, useSaveProfile, useListProjects, useCreateProject, useDirectProject, useGetActivity,
  useGetServiceStatus, getGetMeQueryKey, getListProjectsQueryKey, getGetProjectQueryKey,
} from '@workspace/api-client-react';
import { Btn, ErrorBox, Field, FrameEmpty, Shell, Skel, inputCls } from '@/components/kit';
import { NICHES, errInfo, fmtDur, FREE_PROJECT_LIMIT } from '@/lib/util';
import { UpgradeButton } from '@/components/upgrade-button';

function ProfileForm() {
  const { user } = useUser();
  const qc = useQueryClient();
  const save = useSaveProfile();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (user) {
      setName((n) => n || user.fullName || '');
      setEmail((e) => e || user.primaryEmailAddress?.emailAddress || '');
    }
  }, [user]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ data: { name: name.trim(), email: email.trim() } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    });
  };
  return (
    <motion.form onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md space-y-5">
      <p className="font-mono text-xs tracking-[0.08em] text-primary">Crew sheet</p>
      <h1 className="font-display text-3xl font-normal leading-[1.1]">Who's<br />directing?</h1>
      <p className="text-muted-foreground">One-time details so we can reach you. We verify your email.</p>
      <Field label="Name"><input data-testid="input-name" required maxLength={120} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Email"><input data-testid="input-email" type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      {save.isError && <ErrorBox msg={errInfo(save.error).msg} />}
      <Btn type="submit" loading={save.isPending} className="w-full" data-testid="button-save-profile">Save and continue</Btn>
    </motion.form>
  );
}

function BriefForm({ onNeedPro }: { onNeedPro: () => void }) {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const create = useCreateProject();
  const direct = useDirectProject();
  const [brief, setBrief] = useState('');
  const [niche, setNiche] = useState<(typeof NICHES)[number]>('vlog/travel');
  const [len, setLen] = useState(60);
  const [vibe, setVibe] = useState('Natural');
  const [manual, setManual] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'creating' | 'directing'>('idle');
  const valid = brief.trim().length >= 5 && len >= 10 && len <= 600 && vibe.trim().length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (phase !== 'idle') return;
    if (!valid) {
      setErr(brief.trim().length < 5 ? 'Describe your shoot in at least 5 characters.'
        : len < 10 || len > 600 || !Number.isFinite(len) ? 'Choose a video length between 10 and 600 seconds.'
        : 'Enter a vibe, such as Natural, Calm or Energetic.');
      return;
    }
    setErr(null); setPhase('creating');
    create.mutate({ data: { brief: brief.trim(), niche, targetLength: len, vibe: vibe.trim(), manual } }, {
      onError: (er) => {
        const i = errInfo(er); setPhase('idle'); setErr(i.msg);
        if (i.status === 402 || i.status === 403) onNeedPro();
      },
      onSuccess: (p) => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        if (manual) { nav('/projects/' + p.id); return; }
        setPhase('directing');
        direct.mutate({ id: p.id }, {
          onSuccess: (d) => { qc.setQueryData(getGetProjectQueryKey(d.id), d); nav('/projects/' + d.id); },
          onError: (er) => {
            // project exists; open it so the user can retry directing there
            qc.setQueryData(['director-error', p.id], errInfo(er).msg);
            setPhase('idle'); nav('/projects/' + p.id);
          },
        });
      },
    });
  };
  const busy = phase !== 'idle';
  return (
    <form onSubmit={submit} className="space-y-5 rounded-md border border-border bg-card p-5" data-testid="form-brief">
      <Field label="The brief" hint={brief.trim().length < 5 ? 'At least 5 characters' : undefined}>
        <textarea data-testid="input-brief" rows={4} maxLength={4000} className={inputCls + ' py-3'} placeholder="A 60-second street food walk through Chandni Chowk at dusk..." value={brief} onChange={(e) => setBrief(e.target.value)} />
      </Field>
      <div>
        <span className="font-mono mb-2 block text-[11px] tracking-[0.08em] text-muted-foreground">Niche</span>
        <div className="flex flex-wrap gap-2">
          {NICHES.map((n) => (
            <button type="button" key={n} data-testid={'chip-niche-' + n.replace('/', '-')} onClick={() => setNiche(n)} className={`tap min-h-12 rounded-md border px-4 text-sm font-normal transition ${niche === n ? 'border-primary bg-primary text-primary-foreground' : 'border-white/20 hover:border-white/50'}`}>{n}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={'Target length: ' + fmtDur(len)}>
          <input data-testid="input-length" type="number" min={10} max={600} className={inputCls} value={len} onChange={(e) => setLen(Number(e.target.value))} />
          <input aria-label="length slider" type="range" min={10} max={600} step={5} value={Math.min(600, Math.max(10, len))} onChange={(e) => setLen(Number(e.target.value))} className="mt-3 h-8 w-full accent-[#5B9BFF]" />
        </Field>
        <Field label="Vibe"><input data-testid="input-vibe" maxLength={120} className={inputCls} placeholder="warm, handheld, fast cuts" value={vibe} onChange={(e) => setVibe(e.target.value)} /></Field>
      </div>
      <button type="button" role="switch" aria-checked={manual} data-testid="switch-manual" onClick={() => setManual(!manual)} className="tap flex min-h-14 w-full items-center justify-between rounded-md border border-white/15 px-4 text-left">
        <span><span className="block font-normal">{manual ? 'Manual plan' : 'AI director plans it'}</span><span className="text-xs text-muted-foreground">{manual ? 'Start with a blank shot list and write it yourself' : 'Get a full shot list, voiceover and checklist'}</span></span>
        <span className={`flex h-7 w-12 items-center rounded-full p-1 transition ${manual ? 'bg-primary' : 'bg-white/20'}`}><span className={`size-5 rounded-full bg-background transition-transform ${manual ? 'translate-x-5' : ''}`} /></span>
      </button>
      {err && <ErrorBox msg={err} />}
      <Btn type="submit" loading={busy} className="w-full" data-testid="button-create-project">
        {phase === 'creating' ? 'Opening the project' : phase === 'directing' ? 'Director is planning your shots' : manual ? <><PenLine size={18} /> Create blank plan</> : <><Sparkles size={18} /> Direct my shoot</>}
      </Btn>
    </form>
  );
}

function ProCard({ highlight, paymentsReady = false }: { highlight: boolean; paymentsReady?: boolean }) {
  return (
    <div className={`rounded-md border p-5 transition ${highlight ? 'border-primary bg-primary/10' : 'border-border bg-card'}`} data-testid="card-pro">
      <p className="font-mono text-[11px] tracking-[0.08em] text-primary">Frames Pro</p>
      <p className="font-display mt-1 text-3xl font-normal">&#8377;49 / unlimited projects</p>
      <p className="mt-1 text-sm text-muted-foreground">{highlight ? 'You’ve used all 5 free tries. Upgrade to create more projects. Your existing projects stay accessible.' : 'Your first 5 projects are free. Upgrade after your fifth try for unlimited projects.'}</p>
      {!paymentsReady && <p className="mt-3 text-sm text-muted-foreground" data-testid="text-payments-unavailable">Checkout is not available yet.</p>}
      <div className="mt-4"><UpgradeButton testId="button-buy-pro" /></div>
    </div>
  );
}

function Activity() {
  const { data, isLoading, isError, refetch } = useGetActivity();
  return (
    <section>
      <h2 className="font-display mb-3 text-3xl font-normal">Director's log</h2>
      {isLoading ? <Skel className="h-24" /> : isError ? <ErrorBox msg="Could not load activity." onRetry={() => refetch()} /> : !data?.length ? (
        <p className="rounded-md border border-dashed border-white/15 p-5 text-sm text-muted-foreground" data-testid="text-activity-empty">No events yet. Every AI call you make is logged here.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.slice(0, 12).map((ev) => (
            <li key={ev.id} className="flex items-start justify-between gap-3 p-3 text-sm" data-testid={'row-activity-' + ev.id}>
              <div className="min-w-0"><p className="font-mono text-xs tracking-[0.04em]r text-primary">{ev.agentName}</p><p className="truncate text-muted-foreground">{ev.inputSummary}</p></div>
              <div className="shrink-0 text-right font-mono text-[11px] text-muted-foreground"><p>{new Date(ev.timestamp).toLocaleString()}</p>{ev.humanDecision && <p className="text-foreground">{ev.humanDecision}</p>}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Studio() {
  const me = useGetMe();
  const projects = useListProjects({ query: { enabled: !!me.data?.user, queryKey: getListProjectsQueryKey() } });
  const status = useGetServiceStatus();
  const [needPro, setNeedPro] = useState(false);

  if (me.isLoading) return <Shell nav={false}><Skel className="mb-4 h-16 w-2/3" /><Skel className="h-72" /></Shell>;
  if (me.isError) return <Shell><ErrorBox msg={errInfo(me.error).msg} onRetry={() => me.refetch()} /></Shell>;
  if (!me.data?.user) return <Shell><ProfileForm /></Shell>;
  const user = me.data.user;
  const list = projects.data ?? [];
  const freeLimitReached = !user.pro && projects.isSuccess && list.length >= FREE_PROJECT_LIMIT;
  return (
    <Shell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.08em] text-primary">Studio {user.pro && '/ Pro'}</p>
          <h1 className="font-display text-3xl font-normal leading-[1.1] sm:text-3xl" data-testid="text-greeting">{user.name.split(' ')[0]}'s slate</h1>
          {!user.pro && projects.isSuccess && <p className="mt-2 text-sm text-muted-foreground" data-testid="text-free-tries">{Math.max(0, FREE_PROJECT_LIMIT - list.length)} of {FREE_PROJECT_LIMIT} free tries remaining · one project per try</p>}
        </div>
      </div>
      {status.data && !status.data.ai && <div className="mb-6"><ErrorBox msg="The AI director is not configured on this server. Manual plans still work." /></div>}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <h2 className="font-display text-3xl font-normal">{freeLimitReached ? 'Continue with Pro' : 'New brief'}</h2>
          {freeLimitReached ? <ProCard highlight paymentsReady={status.data?.payments} /> : <BriefForm onNeedPro={() => setNeedPro(true)} />}
        </div>
        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="font-display mb-3 text-3xl font-normal">Projects</h2>
            {projects.isLoading ? <div className="space-y-2"><Skel className="h-20" /><Skel className="h-20" /></div> : projects.isError ? <ErrorBox msg={errInfo(projects.error).msg} onRetry={() => projects.refetch()} /> : list.length === 0 ? (
              <FrameEmpty title="Empty reel" body="Write a brief and your first shot list lands here." />
            ) : (
              <ul className="space-y-2">
                {list.map((p, i) => (
                  <motion.li key={p.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <Link href={'/projects/' + p.id} data-testid={'card-project-' + p.id} className="tap group flex min-h-20 items-center justify-between gap-3 rounded-md border border-border bg-card p-4 transition hover:border-primary">
                      <div className="min-w-0">
                        <p className="truncate font-normal">{p.title}</p>
                        <p className="font-mono mt-1 text-[11px] tracking-[0.04em]r text-muted-foreground">{p.niche} / {fmtDur(p.targetLength)} / {p.shots.length} shots</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2"><span className={`font-mono rounded-sm px-2 py-1 text-[10px] tracking-[0.04em] ${p.status === 'complete' ? 'bg-emerald-500/15 text-emerald-400' : p.status === 'shooting' ? 'bg-primary/15 text-primary' : 'bg-white/10 text-muted-foreground'}`}>{p.status}</span><ChevronRight size={18} className="transition group-hover:translate-x-1" /></span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </section>
          {!user.pro && !freeLimitReached && <AnimatePresence><ProCard highlight={needPro} paymentsReady={status.data?.payments} /></AnimatePresence>}
          <Activity />
        </div>
      </div>
    </Shell>
  );
}
