export const FREE_PROJECT_LIMIT = 5;

export function errInfo(e: unknown): { status?: number; msg: string } {
  const x = e as { status?: number; data?: { error?: string; message?: string } | string | null; message?: string };
  let msg = x?.message ?? 'Request failed';
  if (x?.data && typeof x.data === 'object') msg = x.data.error ?? x.data.message ?? msg;
  else if (typeof x?.data === 'string' && x.data) msg = x.data;
  return { status: x?.status, msg };
}
export const NICHES = ['vlog/travel', 'food', 'fitness', 'product', 'event', 'other'] as const;
export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').split('-').filter(Boolean).slice(0, 5).join('-') || 'shot';
}
export function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  return m ? m + 'm ' + String(s % 60).padStart(2, '0') + 's' : s + 's';
}
