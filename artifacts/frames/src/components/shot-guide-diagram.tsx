import { useId, type CSSProperties } from 'react';
import type { GuideCue } from '@/lib/shot-guides';

const CSS = `
@keyframes sg-pan{from{transform:rotate(calc(var(--d,1)*-26deg))}to{transform:rotate(calc(var(--d,1)*26deg))}}
@keyframes sg-pitch{from{transform:rotate(calc(var(--d,1)*22deg))}to{transform:rotate(calc(var(--d,1)*-22deg))}}
@keyframes sg-fwd{from{transform:translateX(0)}to{transform:translateX(64px)}}
@keyframes sg-back{from{transform:translateX(64px)}to{transform:translateX(0)}}
@keyframes sg-orbit{from{transform:rotate(0)}to{transform:rotate(calc(var(--d,1)*-55deg))}}
@keyframes sg-track{from{transform:translateY(calc(var(--d,1)*-34px))}to{transform:translateY(calc(var(--d,1)*34px))}}
@keyframes sg-steady{from{transform:translate(0,0) rotate(0)}50%{transform:translate(0,-1.5px) rotate(1.2deg)}to{transform:translate(1px,1px) rotate(-1deg)}}
@keyframes sg-grow{from{transform:scale(.55)}to{transform:scale(1.5)}}
@keyframes sg-shrink{from{transform:scale(1.5)}to{transform:scale(.55)}}
@keyframes sg-bg{from{transform:scale(.6)}to{transform:scale(1.6)}}
@keyframes sg-bgmild{from{transform:scale(.9)}to{transform:scale(1.12)}}
@keyframes sg-bgmildr{from{transform:scale(1.12)}to{transform:scale(.9)}}
@keyframes sg-slidex{from{transform:translateX(calc(var(--d,1)*26px))}to{transform:translateX(calc(var(--d,1)*-26px))}}
@keyframes sg-slidey{from{transform:translateY(calc(var(--d,1)*-22px))}to{transform:translateY(calc(var(--d,1)*22px))}}
.sg-a{animation-duration:2.8s;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
`;

type Cfg = { phone?: string; origin?: string; scene?: string; bg?: string; subj?: string };
const CFG: Partial<Record<string, Cfg>> = {
  pan: { phone: 'sg-pan', origin: '60px 75px', scene: 'sg-slidex' },
  tilt: { phone: 'sg-pitch', origin: '60px 72px', scene: 'sg-slidey' },
  'dolly-in': { phone: 'sg-fwd', subj: 'sg-grow', bg: 'sg-bgmild' },
  'dolly-out': { phone: 'sg-back', subj: 'sg-shrink', bg: 'sg-bgmildr' },
  'zoom-in': { scene: 'sg-grow' },
  'zoom-out': { scene: 'sg-shrink' },
  'dolly-zoom': { phone: 'sg-back', bg: 'sg-bg' },
  orbit: { phone: 'sg-orbit', origin: '170px 75px', bg: 'sg-slidex' },
  tracking: { phone: 'sg-track', bg: 'sg-slidex' },
  handheld: { phone: 'sg-steady', origin: '60px 75px', scene: 'sg-steady' },
};
const SCALE: Record<string, number> = { wide: 0.5, medium: 0.9, 'close-up': 1.5, detail: 2.2 };
const MONO = 'JetBrains Mono, monospace';
const VC = '48px 43px';

type Side = { x: number; y: number; tx: number; ty: number };
const SIDE: Record<string, Side> = {
  'eye-level': { x: 60, y: 70, tx: 160, ty: 70 },
  'high-angle': { x: 70, y: 28, tx: 160, ty: 66 },
  'low-angle': { x: 70, y: 120, tx: 160, ty: 90 },
  'top-down': { x: 173, y: 22, tx: 173, ty: 56 },
  tilt: { x: 60, y: 72, tx: 0, ty: 0 },
};

export function Diagram({ cue, playing }: { cue: GuideCue; playing: boolean }) {
  const uid = useId().replace(/:/g, '');
  const mk = `sg-mk-${uid}`;
  const k = cue.kind;
  const c = CFG[k] ?? {};
  const d = cue.direction === 'left' || cue.direction === 'down' ? -1 : 1;
  const side = k in SIDE;
  const custom = k === 'custom-angle' || k === 'custom-movement';
  const run = (name: string | undefined, origin = '0px 0px'): CSSProperties | undefined =>
    name ? ({ animationName: name, animationPlayState: playing ? 'running' : 'paused', transformBox: 'view-box', transformOrigin: origin, '--d': d } as CSSProperties) : undefined;
  const cls = (n?: string) => (n ? 'sg-a' : undefined);
  const arrow = { fill: 'none', stroke: 'hsl(var(--primary))', strokeWidth: 1.6, markerEnd: `url(#${mk})` } as const;

  const phoneShape = (
    <g>
      <rect x={-5} y={-9} width={10} height={18} rx={2} fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth={1.4} />
      <circle cx={5} cy={0} r={1.6} fill="hsl(var(--foreground))" />
      <path d="M5 -6 L26 -16 M5 6 L26 16" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" fill="none" />
    </g>
  );
  const subjTop = <circle cx={170} cy={75} r={11} fill="hsl(var(--foreground))" opacity={0.85} />;

  // motion arrow in the scene
  let motion: React.ReactNode = null;
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, sweep: 0 | 1) => {
    const p = (a: number) => `${cx + r * Math.cos((a * Math.PI) / 180)} ${cy + r * Math.sin((a * Math.PI) / 180)}`;
    return <path d={`M${p(a0)} A${r} ${r} 0 0 ${sweep} ${p(a1)}`} {...arrow} />;
  };
  if (k === 'pan') motion = d > 0 ? arc(60, 75, 36, -35, 35, 1) : arc(60, 75, 36, 35, -35, 0);
  if (k === 'tilt') motion = d > 0 ? arc(60, 72, 36, 35, -35, 0) : arc(60, 72, 36, -35, 35, 1);
  if (k === 'dolly-in') motion = <path d="M40 104 H104" {...arrow} />;
  if (k === 'dolly-out' || k === 'dolly-zoom') motion = <path d="M104 104 H40" {...arrow} />;
  if (k === 'orbit') motion = d > 0 ? arc(170, 75, 60, 180, 125, 0) : arc(170, 75, 60, 180, 235, 1);
  if (k === 'tracking') motion = <path d={d > 0 ? 'M218 40 V112' : 'M218 112 V40'} {...arrow} />;
  if (side && k !== 'tilt') {
    const s = SIDE[k];
    motion = <path d={`M${s.x + (k === 'top-down' ? 0 : 16)} ${s.y + (k === 'top-down' ? 16 : 0)} L${s.tx} ${s.ty}`} {...arrow} strokeDasharray="3 3" />;
  }
  if (k === 'pov') motion = <path d="M126 75 H156" {...arrow} strokeDasharray="3 3" />;
  if (k === 'over-shoulder') motion = <path d="M80 75 H154" {...arrow} strokeDasharray="3 3" />;
  if (['wide', 'medium', 'close-up', 'detail', 'static'].includes(k)) motion = <path d="M80 75 H154" {...arrow} strokeDasharray="3 3" />;
  if (k === 'zoom-in' || k === 'zoom-out') {
    const o = k === 'zoom-in';
    motion = <path d={o ? 'M268 62 L284 52 M268 82 L284 92' : 'M284 62 L268 52 M284 82 L268 92'} {...arrow} transform="translate(-8 0)" />;
  }

  // phone placement
  let phone: React.ReactNode;
  if (side) {
    const s = SIDE[k];
    const rot = k === 'tilt' ? 0 : (Math.atan2(s.ty - s.y, s.tx - s.x) * 180) / Math.PI;
    phone = c.phone ? (
      <g className={cls(c.phone)} style={run(c.phone, c.origin)}><g transform={`translate(${s.x} ${s.y})`}>{phoneShape}</g></g>
    ) : (
      <g transform={`translate(${s.x} ${s.y}) rotate(${rot})`}>{phoneShape}</g>
    );
  } else if (c.phone) {
    const pos = k === 'orbit' ? '110 75' : k.startsWith('dolly') ? '40 75' : '60 75';
    const inner = <g transform={`translate(${pos})`}>{phoneShape}</g>;
    const wrapped = <g className={cls(c.phone)} style={run(c.phone, c.origin)}>{inner}</g>;
    phone = k === 'tracking' ? <g className="sg-a" style={run('sg-track')}>{subjTop}<g transform="translate(60 75)">{phoneShape}</g></g> : wrapped;
  } else {
    phone = <g transform={`translate(${k === 'pov' ? 112 : 60} 75)`}>{phoneShape}</g>;
  }
  const showSubjTop = !side && k !== 'tracking';

  const sceneStyle = run(c.scene, VC);
  const staticScale = SCALE[k] ?? 1;

  return (
    <svg viewBox="0 0 340 160" className="h-auto w-full" role="img" aria-label={`Diagram of ${cue.title}. Illustration only, not footage.`}>
      <style>{CSS}</style>
      <defs>
        <marker id={mk} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" fill="hsl(var(--primary))" />
        </marker>
      </defs>
      <rect x={0.5} y={0.5} width={339} height={159} rx={4} fill="hsl(var(--background))" stroke="hsl(var(--border))" />
      <text x={12} y={16} fontSize={9} fill="hsl(var(--muted-foreground))" fontFamily={MONO}>{side ? 'SIDE VIEW' : 'TOP VIEW'}</text>
      {side ? (
        <>
          <line x1={10} y1={130} x2={220} y2={130} stroke="hsl(var(--border))" />
          <rect x={166} y={78} width={14} height={52} rx={6} fill="hsl(var(--foreground))" opacity={0.85} />
          <circle cx={173} cy={68} r={9} fill="hsl(var(--foreground))" opacity={0.85} />
        </>
      ) : (
        <>
          {k === 'orbit' && <circle cx={170} cy={75} r={60} fill="none" stroke="hsl(var(--border))" strokeDasharray="3 4" />}
          {k === 'over-shoulder' && <circle cx={62} cy={90} r={9} fill="hsl(var(--muted-foreground))" />}
          {showSubjTop && subjTop}
        </>
      )}
      {motion}
      {phone}
      <text x={232} y={22} fontSize={9} fill="hsl(var(--muted-foreground))" fontFamily={MONO}>SCREEN VIEW</text>
      <rect x={232} y={28} width={96} height={86} rx={3} fill="hsl(var(--card))" stroke="hsl(var(--primary))" />
      <svg x={232} y={28} width={96} height={86} viewBox="0 0 96 86">
        <g className={cls(c.scene)} style={sceneStyle}>
          <g className={cls(c.bg)} style={run(c.bg, VC)}>
            <path d="M-20 62 H116 M20 62 V20 M56 62 V34 M78 62 V26" stroke="hsl(var(--border))" strokeWidth={1.5} fill="none" />
            <rect x={8} y={20} width={24} height={42} fill="hsl(var(--muted))" />
            <rect x={60} y={30} width={26} height={32} fill="hsl(var(--muted))" />
          </g>
          <g className={cls(c.subj)} style={c.subj ? run(c.subj, VC) : { transform: `scale(${staticScale})`, transformBox: 'view-box', transformOrigin: VC }}>
            <circle cx={48} cy={30} r={7} fill="hsl(var(--primary))" />
            <rect x={41} y={38} width={14} height={26} rx={5} fill="hsl(var(--primary))" />
          </g>
        </g>
      </svg>
      {custom && <text x={12} y={144} fontSize={9} fill="hsl(var(--muted-foreground))" fontFamily={MONO}>GENERIC POSITION ONLY</text>}
      <text x={12} y={153} fontSize={9} fill="hsl(var(--muted-foreground))" fontFamily={MONO}>Outline: phone  Solid: subject  Arrow: movement</text>
    </svg>
  );
}
