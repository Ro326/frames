import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useClerk } from '@clerk/react';
import { LogOut } from 'lucide-react';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect x="12" y="14" width="40" height="36" rx="3" fill="none" stroke="currentColor" strokeWidth="3.5" />
        <rect x="20" y="22" width="24" height="20" fill="#F5A524" />
        <g fill="currentColor">
          {[18, 30, 42].map((y) => (<g key={y}><rect x="15" y={y} width="3" height="4" /><rect x="46" y={y} width="3" height="4" /></g>))}
        </g>
      </svg>
      <span className="font-display text-[22px] font-extrabold tracking-[0.18em] leading-none">FRAMES</span>
    </span>
  );
}

type Variant = 'amber' | 'ghost' | 'danger' | 'line';
const V: Record<Variant, string> = {
  amber: 'bg-primary text-primary-foreground hover:brightness-110',
  ghost: 'bg-secondary text-foreground hover:bg-white/10',
  line: 'border border-white/25 text-foreground hover:border-primary hover:text-primary',
  danger: 'bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25',
};
export function Btn({ variant = 'amber', className = '', loading, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={`tap inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-bold tracking-wide transition disabled:opacity-40 disabled:pointer-events-none ${V[variant]} ${className}`}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export const inputCls = 'min-h-12 w-full rounded-md border border-input bg-black/40 px-4 text-[16px] text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="font-mono mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Shell({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  const { signOut } = useClerk();
  return (
    <div className="grain min-h-[100dvh]">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/studio" data-testid="link-logo"><Logo /></Link>
          {nav && (
            <button data-testid="button-sign-out" onClick={() => signOut({ redirectUrl: '/' })} className="tap font-mono flex min-h-12 items-center gap-2 px-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
              <LogOut size={16} /> Sign out
            </button>
          )}
        </div>
        <div className="sprockets opacity-60" />
      </header>
      <motion.main initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="mx-auto max-w-5xl px-4 pb-24 pt-8">
        {children}
      </motion.main>
    </div>
  );
}

export function Skel({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/[0.06] ${className}`} />;
}

export function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
      <span data-testid="text-error">{msg}</span>
      {onRetry && <Btn variant="danger" onClick={onRetry} data-testid="button-retry">Retry</Btn>}
    </div>
  );
}

export function FrameEmpty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-white/20 p-10 text-center">
      <div className="mx-auto mb-5 grid h-20 w-32 place-items-center border-2 border-white/30 relative">
        <div className="size-3 rounded-full bg-primary rec-dot" />
        <span className="absolute -left-1 top-2 h-2 w-1 bg-white/30" /><span className="absolute -right-1 top-2 h-2 w-1 bg-white/30" />
      </div>
      <h3 className="font-display text-3xl font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-muted-foreground">{body}</p>
      <div className="mt-5 flex justify-center">{children}</div>
    </div>
  );
}
