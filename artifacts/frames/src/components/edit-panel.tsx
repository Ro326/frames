import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { Download, Lock, Mic } from 'lucide-react';
import type { Project } from '@workspace/api-client-react';
import { Btn, ErrorBox } from '@/components/kit';
import { getClip } from '@/lib/clips';
import { slugify } from '@/lib/util';
import { Mp4Export } from '@/components/mp4-export';
import { UpgradeButton } from '@/components/upgrade-button';

function extOf(name: string, type: string) {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  if (m) return m[1].toLowerCase();
  return type.split('/')[1]?.split(';')[0] || 'mp4';
}
const pad = (n: number) => String(n).padStart(2, '0');

function Voiceover({ project }: { project: Project }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const gen = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/projects/' + project.id + '/voiceover', { method: 'POST', credentials: 'include' });
      if (r.status === 503) throw new Error('Voiceover is not configured on the server yet. Setup is needed.');
      if (!r.ok) throw new Error('Voiceover failed (' + r.status + ').');
      setUrl(URL.createObjectURL(await r.blob()));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Voiceover failed.'); }
    setBusy(false);
  };
  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4">
      <h3 className="font-display text-3xl font-normal">Voiceover</h3>
      <p className="max-h-40 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">{project.voiceover || 'No script yet.'}</p>
      {err && <ErrorBox msg={err} onRetry={gen} />}
      {url && <><audio controls src={url} className="w-full" data-testid="audio-voiceover" /><a href={url} download={'voiceover_' + project.id + '.mp3'} data-testid="link-download-mp3" className="tap inline-flex min-h-12 items-center gap-2 rounded-md bg-secondary px-5 font-normal"><Download size={16} /> Download MP3</a></>}
      <Btn variant={url ? 'ghost' : 'solid'} loading={busy} disabled={!project.voiceover.trim()} onClick={gen} data-testid="button-generate-voiceover"><Mic size={16} /> {url ? 'Regenerate' : 'Generate voiceover'}</Btn>
    </section>
  );
}

export function EditPanel({ project }: { project: Project }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const shots = project.shots;
  const ready = shots.length > 0 && shots.every((s) => s.approved);
  if (!ready) return (
    <div className="space-y-5"><UpgradeButton testId="button-edit-pro" /><div className="rounded-md border border-dashed border-white/20 p-10 text-center" data-testid="edit-locked">
      <Lock className="mx-auto mb-3 text-muted-foreground" />
      <h3 className="font-display text-3xl font-normal">Edit table locked</h3>
      <p className="mt-2 text-muted-foreground">Approve every shot to unlock the finished MP4 and optional editing ZIP. {shots.filter((s) => s.approved).length}/{shots.length} done.</p>
    </div></div>
  );
  const exportZip = async () => {
    setBusy(true); setErr(null); setOk(false);
    try {
      const clips = await Promise.all(shots.map((s) => getClip(project.id, s.id)));
      const missing = shots.map((s, i) => (clips[i] ? null : pad(i + 1) + ' ' + s.section)).filter(Boolean);
      if (missing.length) throw new Error('Local clip missing on this device for shot ' + missing.join(', ') + '. Clips live in this browser only; re-upload them in Shoot, then export.');
      const zip = new JSZip();
      const rows: string[] = [];
      shots.forEach((s, i) => {
        const c = clips[i]!;
        const fn = pad(i + 1) + '_' + s.section + '_' + slugify(s.description) + '.' + extOf(c.name, c.blob.type);
        zip.file(fn, c.blob);
        const cell = (text: string) => text.replace(/\|/g, '/').replace(/\r?\n/g, ' ');
        const verdict = s.verdict ? `${s.verdict.verdict} (${Math.round(s.verdict.confidence * 100)}% confidence)` : 'No AI verdict';
        const decision = s.approved && s.verdict && !s.verdict.match ? 'Human override' : s.approved ? 'Approved' : 'Pending';
        rows.push('| ' + pad(i + 1) + ' | ' + s.section + ' | ' + s.type + ' | ' + cell(s.description) + ' | ' + cell(s.angle) + ' | ' + cell(s.movement) + ' | ' + s.duration + 's | ' + cell(s.props.join(', ')) + ' | ' + fn + ' | ' + cell(verdict) + ' | ' + decision + ' | ' + cell(s.verdict?.fix ?? '') + ' |');
      });
      const sheet = '# ' + project.title + '\n\n' + project.brief + '\n\nNiche: ' + project.niche + ' / Target: ' + project.targetLength + 's / Vibe: ' + project.vibe + '\n\n| # | Section | Type | Description | Angle | Movement | Duration | Props | File | AI verdict | Decision | Fix |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n' + rows.join('\n') + '\n\n## Checklist\n\n' + project.checklist.map((c) => '- [ ] ' + c).join('\n') + '\n';
      zip.file('shot_sheet.md', sheet);
      zip.file('voiceover.txt', project.voiceover);
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = slugify(project.title) + '_frames.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setOk(true);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Export failed.'); }
    setBusy(false);
  };
  return (
    <div className="space-y-6">
      <UpgradeButton testId="button-edit-pro" />
      <Mp4Export key={`${project.id}:${project.approvedAt ?? ''}`} project={project} />
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[520px] text-left text-sm" data-testid="table-edit">
          <thead className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground"><tr>{['#', 'Section', 'Shot', 'Dur', 'Clip'].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>{shots.map((s, i) => <tr key={s.id} className="border-t border-border"><td className="p-3 font-mono text-primary">{pad(i + 1)}</td><td className="p-3">{s.section}</td><td className="p-3">{s.description}</td><td className="p-3 font-mono">{s.duration}s</td><td className="p-3 text-muted-foreground">{s.clipName ?? '-'}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">Prefer to edit elsewhere? Download the original clips, shot sheet and voiceover script as a ZIP. This optional editing pack is assembled on your device; nothing is uploaded.</p>
      {err && <ErrorBox msg={err} onRetry={exportZip} />}
      {ok && <p className="text-sm text-emerald-400" data-testid="text-zip-done">ZIP built. Check your downloads.</p>}
      <Btn variant="line" loading={busy} onClick={exportZip} className="w-full" data-testid="button-download-zip"><Download size={18} /> Download editing pack ZIP (optional)</Btn>
      <Voiceover project={project} />
    </div>
  );
}
