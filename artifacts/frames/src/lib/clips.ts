// Clips live only in this browser (IndexedDB). No video bytes are sent anywhere.
export interface StoredClip { blob: Blob; name: string }
const DB = 'frames-clips';
const STORE = 'clips';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const key = (p: number, s: string) => p + ':' + s;
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const transaction = db.transaction(STORE, mode);
    const r = fn(transaction.objectStore(STORE));
    transaction.oncomplete = () => { db.close(); res(r.result); };
    transaction.onerror = () => { db.close(); rej(transaction.error ?? r.error); };
    transaction.onabort = () => { db.close(); rej(transaction.error ?? new Error('Local storage transaction was cancelled.')); };
  });
}
export const putClip = (p: number, s: string, c: StoredClip) => tx('readwrite', (st) => st.put(c, key(p, s)));
export const getClip = (p: number, s: string) => tx<StoredClip | undefined>('readonly', (st) => st.get(key(p, s)));
export const delClip = (p: number, s: string) => tx('readwrite', (st) => st.delete(key(p, s)));
export async function listClipIds(p: number): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (st) => st.getAllKeys());
  return keys.map(String).filter((k) => k.startsWith(p + ':')).map((k) => k.slice(String(p).length + 1));
}

export async function extractFrames(blob: Blob): Promise<string[]> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error('This video could not be read in the browser.'));
    });
    if (!isFinite(v.duration) || v.duration <= 0) throw new Error('Video has no readable duration.');
    const scale = Math.min(1, 512 / Math.max(v.videoWidth || 512, v.videoHeight || 512));
    const w = Math.max(1, Math.round((v.videoWidth || 512) * scale));
    const h = Math.max(1, Math.round((v.videoHeight || 512) * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    const out: string[] = [];
    for (const f of [0.2, 0.5, 0.8]) {
      await new Promise<void>((res, rej) => {
        v.onseeked = () => res();
        v.onerror = () => rej(new Error('Seek failed.'));
        v.currentTime = v.duration * f;
      });
      ctx.drawImage(v, 0, 0, w, h);
      let q = 0.75, d = c.toDataURL('image/jpeg', q);
      while (d.length > 650000 && q > 0.2) { q -= 0.15; d = c.toDataURL('image/jpeg', q); }
      out.push(d);
    }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
