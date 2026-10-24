// Isolated visual check using the real diagram and guide resolver.
// Bundle with esbuild --platform=node --format=cjs --jsx=automatic, then run
// to emit static HTML. No accounts, API calls, or application data are involved.
import { renderToStaticMarkup } from 'react-dom/server';
import { Diagram } from '../src/components/shot-guide-diagram';
import { resolveShotGuide } from '../src/lib/shot-guides';

const examples = [
  { angle: 'Top-down close-up', movement: 'Static', description: 'Plate the dish from directly above.', show: 'angle' },
  { angle: 'Eye-level wide', movement: 'Pan right', description: 'Reveal the landscape.', show: 'movement' },
  { angle: 'Low angle', movement: 'Tilt up', description: 'Show a tall subject from below.', show: 'movement' },
  { angle: 'Eye-level medium', movement: 'Dolly zoom', description: 'Keep the subject the same size as the background changes.', show: 'movement' },
  { angle: 'High angle', movement: 'Dolly in', description: 'Move closer to the subject.', show: 'movement' },
  { angle: 'Eye-level', movement: 'Zoom in', description: 'Tighten the crop without moving the phone.', show: 'movement' },
] as const;

const style = `
  :root {--background:220 9% 4%;--foreground:0 0% 96%;--primary:217 91% 64%;--card:220 8% 7%;--border:220 7% 18%;--muted:220 7% 14%;--muted-foreground:220 3% 65%;}
  *{box-sizing:border-box}body{margin:0;padding:24px;background:hsl(var(--background));color:hsl(var(--foreground));font:400 15px/1.6 system-ui,sans-serif}
  main{max-width:1000px;margin:auto}h1{font-size:28px;font-weight:300;margin:0 0 24px}h2{font-size:20px;font-weight:400;margin:12px 0 6px}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}article{min-width:0;padding:20px;border:1px solid hsl(var(--border));border-radius:8px}
  svg{width:100%;height:auto}p{margin:8px 0}.note{font-size:12px;color:hsl(var(--muted-foreground))}
  @media(max-width:600px){body{padding:16px}.grid{grid-template-columns:1fr}article{padding:14px}}
`;
process.stdout.write('<!doctype html>' + renderToStaticMarkup(
  <html lang="en"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>{style}</style><title>Shot guide visual check</title></head>
    <body><main><h1>Show me how · diagram check</h1><div className="grid">{examples.map((shot, i) => {
      const guide = resolveShotGuide(shot);
      const cue = shot.show === 'angle' ? guide.angle : guide.movement;
      return <article key={i}><p className="note">{shot.angle} / {shot.movement}</p><Diagram cue={cue} playing={false} /><h2>{cue.title}</h2><p>{cue.instruction}</p><p className="note">{cue.alternative ?? 'Illustration only—not footage.'}</p></article>;
    })}</div></main></body>
  </html>,
));
