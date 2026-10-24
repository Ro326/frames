import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useGetAdmin, getGetAdminQueryKey } from '@workspace/api-client-react';
import { Btn, ErrorBox, Field, Logo, Skel, inputCls } from '@/components/kit';
import { errInfo } from '@/lib/util';

export default function Admin() {
  const [draft, setDraft] = useState('');
  const [pw, setPw] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const q = useGetAdmin({
    query: { enabled: pw !== null, queryKey: [...getGetAdminQueryKey(), 'session', attempt], retry: false, staleTime: 0, gcTime: 0, refetchInterval: pw !== null ? 30000 : false },
    request: { headers: { Authorization: 'Basic ' + btoa(Array.from(new TextEncoder().encode('admin:' + (pw ?? '')), (byte) => String.fromCharCode(byte)).join('')) } },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setPw(draft); setAttempt((n) => n + 1); };
  const err = q.isError ? errInfo(q.error) : null;
  const authed = pw !== null && !!q.data;
  return (
    <div className="grain min-h-[100dvh] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between"><Link href="/" data-testid="link-home"><Logo /></Link><span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Admin</span></div>
        {!authed && (
          <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 pt-10">
            <h1 className="font-display text-6xl font-bold leading-none">Control<br />room</h1>
            <Field label="Admin password"><input data-testid="input-admin-password" type="password" autoComplete="off" className={inputCls} value={draft} onChange={(e) => setDraft(e.target.value)} /></Field>
            {err && (err.status === 503 ? <ErrorBox msg="Admin is not configured. The server needs an ADMIN_PASSWORD secret." /> : err.status === 401 ? <ErrorBox msg="Wrong password." /> : <ErrorBox msg={err.msg} />)}
            <Btn type="submit" loading={q.isFetching} disabled={!draft} className="w-full" data-testid="button-admin-unlock">Unlock</Btn>
            <p className="text-xs text-muted-foreground">The password is held in memory for this visit only and is never stored.</p>
          </form>
        )}
        {authed && q.data && (
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-px bg-border">
              {[['Users', q.data.userCount], ['Projects', q.data.projectCount], ['Events', q.data.eventCount]].map(([l, v]) => (
                <div key={l as string} className="bg-background p-4"><p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{l}</p><p className="font-display text-5xl font-bold text-primary" data-testid={'stat-' + String(l).toLowerCase()}>{v}</p></div>
              ))}
            </div>
            <section>
              <h2 className="font-display mb-3 text-3xl font-bold">Users</h2>
              {q.data.users.length === 0 ? <p className="rounded-md border border-dashed border-white/15 p-5 text-sm text-muted-foreground">No users yet.</p> : (
                <div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><tr>{['Name', 'Email', 'Phone', 'Plan', 'Joined'].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
                   <tbody>{q.data.users.map((u) => <tr key={u.id} className="border-t border-border" data-testid={'row-user-' + u.id}><td className="p-3">{u.name}</td><td className="p-3">{u.email}</td><td className="p-3">{u.phone}</td><td className="p-3">{u.pro ? <span className="text-primary">Pro</span> : 'Free'}</td><td className="p-3 text-muted-foreground">{new Date(u.createdAt).toLocaleString()}</td></tr>)}</tbody>
                </table></div>
              )}
            </section>
            <section>
              <h2 className="font-display mb-3 text-3xl font-bold">Audit log</h2>
              {q.data.events.length === 0 ? <p className="rounded-md border border-dashed border-white/15 p-5 text-sm text-muted-foreground">No events recorded.</p> : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {q.data.events.map((ev) => (
                    <li key={ev.id} className="p-3 text-sm" data-testid={'row-event-' + ev.id}>
                      <div className="flex flex-wrap justify-between gap-2 font-mono text-[11px] uppercase tracking-wider"><span className="text-primary">{ev.agentName} / user {ev.userId}</span><span className="text-muted-foreground">{new Date(ev.timestamp).toLocaleString()}</span></div>
                      <p className="mt-1 text-muted-foreground">{ev.inputSummary}</p>
                      {ev.humanDecision && <p className="mt-1">Decision: {ev.humanDecision}</p>}
                      <details className="mt-1"><summary className="cursor-pointer text-xs text-muted-foreground">Output</summary><pre className="mt-1 overflow-x-auto rounded bg-black/50 p-2 text-xs">{JSON.stringify(ev.outputJson, null, 2)}</pre></details>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Btn variant="ghost" onClick={() => { setPw(null); setDraft(''); setAttempt((n) => n + 1); }} data-testid="button-admin-lock">Lock</Btn>
          </div>
        )}
        {pw !== null && q.isFetching && !authed && <Skel className="mx-auto mt-6 h-10 max-w-sm" />}
      </div>
    </div>
  );
}
