import { Link, Redirect } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@clerk/react';
import { ArrowRight, HardDrive, ScanEye, ListChecks, Clapperboard, Package } from 'lucide-react';
import { Logo } from '@/components/kit';

const steps = [
  { n: '01', t: 'Brief', d: 'Say what you are making, how long, and the vibe. Two sentences is enough.', i: Clapperboard },
  { n: '02', t: 'Plan', d: 'A shot list with angles, movement, props and a tip for each. Edit every line, then lock it.', i: ListChecks },
  { n: '03', t: 'Shoot', d: 'Film each shot. The director looks at three frames from your clip and tells you: go ahead, or fix this.', i: ScanEye },
  { n: '04', t: 'Edit-ready', d: 'Every shot approved, then one ZIP: ordered clips, shot sheet, voiceover script.', i: Package },
];

const rise = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0 } };

export default function Landing() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/studio" />;
  const cta = '/sign-up';
  return (
    <div className="grain overflow-x-hidden">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/sign-in" data-testid="link-sign-in" className="tap flex min-h-12 items-center px-3 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">Sign in</Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-10 sm:pt-20">
        <div className="pointer-events-none absolute right-[-12%] top-6 hidden aspect-[3/2] w-[56%] border-2 border-white/10 md:block">
          <div className="absolute inset-4 border border-primary/40" />
          <div className="absolute left-4 top-4 flex items-center gap-2 font-mono text-[11px] tracking-widest text-primary"><span className="size-2 rounded-full bg-primary rec-dot" />REC 00:00:47</div>
          <div className="absolute bottom-4 right-4 font-mono text-[11px] tracking-widest text-white/40">A-ROLL / 20% 50% 80%</div>
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="font-mono mb-6 text-xs uppercase tracking-[0.24em] text-primary">The shoot director in your pocket</motion.p>
        <motion.h1 initial="hidden" animate="show" variants={rise} transition={{ duration: 0.7, ease: 'easeOut' }} className="font-display text-[22vw] font-extrabold leading-[0.82] sm:text-[11rem]">
          Don't<br />shoot<br /><span className="text-primary">blind.</span>
        </motion.h1>
        <motion.p initial="hidden" animate="show" variants={rise} transition={{ delay: 0.25, duration: 0.6 }} className="mt-8 max-w-md text-lg text-muted-foreground">
          FRAMES plans your shots, stands beside you while you film, and checks every clip before you walk away from the location. No missed angles. No reshoot day.
        </motion.p>
        <motion.div initial="hidden" animate="show" variants={rise} transition={{ delay: 0.4, duration: 0.6 }} className="mt-10 flex flex-wrap gap-3">
          <Link href={cta} data-testid="button-start" className="tap group inline-flex min-h-14 items-center gap-3 rounded-md bg-primary px-7 text-base font-bold text-primary-foreground">
            Start your first shoot <ArrowRight className="transition group-hover:translate-x-1" size={18} />
          </Link>
          <Link href="/sign-in" data-testid="link-sign-in-hero" className="tap inline-flex min-h-14 items-center rounded-md border border-white/25 px-7 text-base font-bold hover:border-primary hover:text-primary">I have an account</Link>
        </motion.div>
      </section>

      <div className="overflow-hidden border-y border-border py-3">
        <div className="reel flex w-max gap-10 font-display text-2xl tracking-[0.2em] text-white/25">
          {Array.from({ length: 16 }).map((_, i) => <span key={i}>{['BRIEF', 'PLAN', 'SHOOT', 'CHECK', 'EDIT'][i % 5]} <span className="text-primary">/</span></span>)}
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-5 py-24">
        <h2 className="font-display mb-12 text-6xl font-bold sm:text-8xl">Brief to <span className="text-primary">footage.</span></h2>
        <div className="grid gap-px bg-border md:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ delay: i * 0.08 }} className="group bg-background p-6 transition hover:bg-card">
              <div className="mb-10 flex items-center justify-between"><span className="font-mono text-xs text-primary">{s.n}</span><s.i size={20} className="text-muted-foreground transition group-hover:text-primary" /></div>
              <h3 className="font-display text-4xl font-bold">{s.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.1fr_1fr]">
        <div>
          <HardDrive className="mb-5 text-primary" />
          <h2 className="font-display text-5xl font-bold sm:text-7xl">Your clips<br />never leave<br />your phone.</h2>
        </div>
        <div className="self-end space-y-4 text-muted-foreground">
          <p>The director never sees your video. In the browser, FRAMES grabs three still frames from each clip, 20%, 50% and 80% in, scaled small, and sends only those stills for review.</p>
          <p>The footage itself is stored on this device. When every shot is approved, the ZIP is built right here, offline from our servers.</p>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Clear the browser data and the clips go with it. Export before you do.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid gap-px bg-border md:grid-cols-2">
          <div className="bg-background p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Free</p>
            <p className="font-display mt-2 text-7xl font-bold">1 project</p>
            <p className="mt-3 text-muted-foreground">The full workflow, start to ZIP, on one shoot.</p>
          </div>
          <div className="bg-card p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">Frames Pro</p>
            <p className="font-display mt-2 text-7xl font-bold">&#8377;49</p>
            <p className="mt-3 text-muted-foreground">Unlimited projects. One payment, no subscription theatre.</p>
          </div>
        </div>
      </section>

      <section className="relative border-t border-border px-5 py-28 text-center">
        <h2 className="font-display mx-auto max-w-3xl text-6xl font-extrabold sm:text-9xl">Quiet on set.</h2>
        <Link href={cta} data-testid="button-start-footer" className="tap mt-10 inline-flex min-h-14 items-center gap-3 rounded-md bg-primary px-8 text-base font-bold text-primary-foreground">
          Start your first shoot <ArrowRight size={18} />
        </Link>
        <div className="mt-16 flex justify-center text-white/60"><Logo size={22} /></div>
      </section>
    </div>
  );
}
