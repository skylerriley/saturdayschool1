// ============================================================
// WRITE OUTBOX — IndexedDB-backed queue of DB writes that could
// not be sent (no connectivity). The REST wrapper (supabaseClient.ts)
// enqueues idempotent writes (PATCH / DELETE / UPSERT) here when the
// network is down and replays them FIFO when it returns. Persisting
// to IndexedDB means queued scores survive the PWA being closed
// mid-round — the sync completes on next open.
//
// Falls back to an in-memory queue when IndexedDB is unavailable
// (writes then survive the session but not an app restart).
// ============================================================

export interface OutboxOp {
  id?: number;
  table: string;
  kind: "PATCH" | "DELETE" | "UPSERT";
  body: any;
  query: string;        // querystring for PATCH/DELETE, e.g. "?signup_id=eq.5"
  onConflict?: string;  // UPSERT conflict target, e.g. "summary_id,hole_number"
  dedupeKey?: string;   // ops sharing a key: newest replaces the queued one
  ts: number;
  attempts?: number;    // failed replay attempts (transient server errors)
}

const DB_NAME = "ss-write-outbox";
const STORE = "ops";

let memQueue: OutboxOp[] | null = null; // fallback when IDB unavailable
let memNextId = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") { resolve(null); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  });
}

// -- change notification (drives the "N pending sync" pill) ----
const listeners = new Set<() => void>();
export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function notifyOutbox() { listeners.forEach((fn) => { try { fn(); } catch { /* listener errors must not break the queue */ } }); }

export async function outboxAll(): Promise<OutboxOp[]> {
  const db = await openDb();
  if (!db) return memQueue ? [...memQueue] : [];
  const rows = await tx<OutboxOp[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxOp[]>);
  return (rows || []).sort((a, b) => (a.id! - b.id!));
}

export async function outboxCount(): Promise<number> {
  const db = await openDb();
  if (!db) return memQueue?.length ?? 0;
  const n = await tx<number>("readonly", (s) => s.count());
  return n ?? 0;
}

export async function outboxRemove(id: number): Promise<void> {
  const db = await openDb();
  if (!db) { if (memQueue) memQueue = memQueue.filter((o) => o.id !== id); return; }
  await tx("readwrite", (s) => s.delete(id));
}

export async function outboxRemoveWhere(pred: (op: OutboxOp) => boolean): Promise<void> {
  const db = await openDb();
  if (!db) { if (memQueue) memQueue = memQueue.filter((o) => !pred(o)); return; }
  const all = await outboxAll();
  for (const op of all) {
    if (pred(op)) await tx("readwrite", (s) => s.delete(op.id!));
  }
}

// Update an op in place (used to persist the replay attempt counter).
export async function outboxPut(op: OutboxOp): Promise<void> {
  const db = await openDb();
  if (!db) {
    if (memQueue) memQueue = memQueue.map((o) => (o.id === op.id ? op : o));
    return;
  }
  await tx("readwrite", (s) => s.put(op));
}

export async function outboxAdd(op: OutboxOp): Promise<void> {
  // Newest write wins for the same logical target (e.g. repeated RSVP
  // toggles or running-total updates) — drop the superseded queued op.
  if (op.dedupeKey) await outboxRemoveWhere((o) => o.dedupeKey === op.dedupeKey);

  const db = await openDb();
  if (!db) {
    if (!memQueue) memQueue = [];
    memQueue.push({ ...op, id: memNextId++ });
  } else {
    await tx("readwrite", (s) => s.add(op));
  }
  notifyOutbox();
}
