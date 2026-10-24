// Temporary browser verification entry; fixtures use a negative project ID and
// never touch Clerk, application records, agent events, or real creators' clips.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import type { Project } from '@workspace/api-client-react';
import { EditPanel } from '../src/components/edit-panel';
import { putClip, getClip, delClip } from '../src/lib/clips';
import '../src/index.css';

const id = -987654321;
const shots = ['red', 'blue'].map((name, index) => ({
  id: `export-test-${name}`, section: index === 0 ? 'Intro' : 'Outro',
  description: `${name} test scene`, angle: 'Wide', movement: 'Static', type: 'B-roll',
  props: [], duration: index === 0 ? 1.25 : 0.75, tip: '', approved: true, clipName: name,
}));
const project = {
  id, title: 'MP4 export check', brief: 'Isolated browser fixtures', niche: 'other',
  targetLength: 2, vibe: 'simple', manual: true, status: 'complete', shots,
  voiceover: '', checklist: [], createdAt: new Date().toISOString(), approvedAt: new Date().toISOString(),
} as Project;

async function prepare() {
  for (let index = 0; index < shots.length; index++) {
    const filename = index === 0 ? 'red.webm' : 'blue.mp4';
    const response = await fetch(`/__mp4-fixtures/${filename}`);
    if (!response.ok) throw new Error('Fixture unavailable');
    await putClip(id, shots[index]!.id, { blob: await response.blob(), name: filename });
  }
}
function Harness() {
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState('Ready with 2 local fixture clips');
  const [version, setVersion] = useState(0);
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
    <h1 className="font-display text-3xl">Isolated MP4 export check</h1>
    <p data-testid="harness-status">{status}</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={async () => { await delClip(id, shots[1]!.id); setStatus('Second clip removed'); }}>Remove second clip</button>
      <button type="button" onClick={async () => { await prepare(); setStatus('Fixtures restored'); setVersion((v) => v + 1); }}>Restore fixtures</button>
      <button type="button" onClick={() => setLocked((value) => !value)}>Toggle approval</button>
      <button type="button" onClick={async () => { const clips = await Promise.all(shots.map((shot) => getClip(id, shot.id))); setStatus(clips.map((clip) => clip?.blob.size ?? 0).join(',')); }}>Check source bytes</button>
    </div>
    <EditPanel key={version} project={{ ...project, shots: project.shots.map((shot) => ({ ...shot, approved: !locked })) }} />
  </main>;
}

if (!import.meta.env.DEV) throw new Error('Development verification only.');
prepare().then(() => createRoot(document.getElementById('root')!).render(<Harness />))
  .catch((error: unknown) => { document.getElementById('root')!.textContent = String(error); });
