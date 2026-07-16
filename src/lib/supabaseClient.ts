// ============================================================
// SUPABASE CLIENT
// Paste your project URL and anon key here (or use env vars).
// Get these from: Supabase dashboard -> Settings -> API
// ============================================================
import { outboxAdd, outboxAll, outboxRemove, outboxRemoveWhere, outboxPut, outboxCount, subscribeOutbox, notifyOutbox, type OutboxOp } from "./writeOutbox";

export { outboxCount as pendingWriteCount, subscribeOutbox };

export const SUPABASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) || "https://YOUR_PROJECT_ID.supabase.co";
export const SUPABASE_KEY = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || "YOUR_ANON_KEY_HERE";
export const VAPID_PUBLIC_KEY = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY) || "";
export const GCAPI_KEY = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GCAPI_KEY) || "";

// Helper to call the send-push-notification edge function
export async function sendPush(title: string, body: string, url = "/") {
  return fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + SUPABASE_KEY,
    },
    body: JSON.stringify({ title, body, url }),
  });
}

// ── Write-error reporting ───────────────────────────────────
// App.tsx registers its showError toast here at boot so genuine server
// rejections surface to the user instead of dying in a silent .catch.
// Errors raised before React mounts (the module-load outbox flush) are
// buffered and delivered once the real reporter registers — otherwise a
// boot-time replay failure would only ever reach the console.
let preMountErrorBuffer: string[] | null = [];
let writeErrorReporter: (msg: string) => void = (msg) => {
  console.warn("[db]", msg);
  if (preMountErrorBuffer && preMountErrorBuffer.length < 10) preMountErrorBuffer.push(msg);
};
export function setWriteErrorReporter(fn: (msg: string) => void) {
  writeErrorReporter = fn;
  if (preMountErrorBuffer?.length) {
    const buffered = preMountErrorBuffer;
    preMountErrorBuffer = null;
    fn(buffered.length === 1 ? buffered[0] : `${buffered.length} saved changes failed to sync — ${buffered[0]}`);
  }
  preMountErrorBuffer = null;
}
// Catch handler for fire-and-forget writes: `.catch(reportWriteError("RSVP save"))`
export const reportWriteError = (context: string) => (e: any) => {
  writeErrorReporter(`${context} failed: ${e?.message || String(e)}`);
};

// A fetch() that rejects with TypeError (or while offline) never reached the
// server — safe to queue and replay. An HTTP error response is a real
// rejection and must surface instead.
const isNetworkFailure = (e: any) =>
  (typeof navigator !== "undefined" && !navigator.onLine) || e instanceof TypeError;

// Dedupe key so repeated writes to the same target keep only the newest op.
function opDedupeKey(op: Omit<OutboxOp, "ts">): string | undefined {
  if (op.kind === "PATCH" || op.kind === "DELETE") return `${op.table}|${op.kind}|${op.query}`;
  if (op.kind === "UPSERT" && op.table === "hole_scores" && !Array.isArray(op.body)) {
    return `hole_scores|UPSERT|${op.body.summary_id}|${op.body.hole_number}`;
  }
  return undefined;
}

async function enqueueWrite(op: Omit<OutboxOp, "ts" | "dedupeKey">) {
  // hole_scores reconciliation: a queued upsert and a queued delete for the
  // same hole cancel out — keep only the most recent intent.
  if (op.table === "hole_scores") {
    if (op.kind === "DELETE") {
      const m = /summary_id=eq\.(\d+).*hole_number=eq\.(\d+)/.exec(op.query);
      if (m) await outboxRemoveWhere((o) =>
        o.table === "hole_scores" && o.kind === "UPSERT" && !Array.isArray(o.body) &&
        String(o.body.summary_id) === m[1] && String(o.body.hole_number) === m[2]);
    } else if (op.kind === "UPSERT" && !Array.isArray(op.body)) {
      await outboxRemoveWhere((o) =>
        o.table === "hole_scores" && o.kind === "DELETE" &&
        o.query.includes(`summary_id=eq.${op.body.summary_id}`) &&
        o.query.includes(`hole_number=eq.${op.body.hole_number}`));
    }
  }
  await outboxAdd({ ...op, dedupeKey: opDedupeKey(op as any), ts: Date.now() });
}

const restHeaders = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation",
};

const doRpcFetch = async (table: string, method: string, body?: any, query = "") => {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  // keepalive: fire-and-forget writes are often issued right as the user
  // backgrounds/quits the PWA — without it iOS aborts the in-flight request
  // and the write silently evaporates.
  const res = await fetch(url, { method, headers: restHeaders, body: body ? JSON.stringify(body) : undefined, keepalive: true });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e: any = new Error(err.message || `${method} ${table} failed (${res.status})`);
    e.status = res.status;
    throw e;
  }
  if (res.status === 204) return [];
  return res.json();
};

const doUpsertFetch = async (table: string, data: any, onConflict?: string) => {
  // Supabase upsert requires "resolution=merge-duplicates" in the Prefer header.
  // Without it, the on_conflict param is ignored and the row is inserted fresh
  // (or silently rejected as a duplicate), so corrections never reach the DB.
  const upsertHeaders = { ...restHeaders, "Prefer": "resolution=merge-duplicates,return=representation" };
  const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`;
  const body = Array.isArray(data) ? data : [data];
  const res = await fetch(url, { method: "POST", headers: upsertHeaders, body: JSON.stringify(body), keepalive: true });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e: any = new Error(err.message || `upsert ${table} failed (${res.status})`);
    e.status = res.status;
    throw e;
  }
  if (res.status === 204) return [];
  return res.json();
};

// ── Queued-op supersede ─────────────────────────────────────
// A write that succeeds DIRECTLY supersedes older queued ops for the same
// row. Without this, an op queued during an earlier network blip (e.g.
// "early_tee_request: true") survives in IndexedDB and replays at next boot,
// resurrecting state the user has since changed from a working connection.
// PATCH: strip the just-written columns from queued bodies (other columns in
// a queued op are still valid intent); drop the op if nothing remains.
// DELETE: the row is gone — any queued write to it is moot.
async function supersedeQueuedOps(table: string, kind: "PATCH" | "DELETE", query: string, body: any) {
  try {
    let changed = false;
    for (const op of await outboxAll()) {
      if (op.table !== table || op.query !== query) continue;
      if (kind === "DELETE") {
        await outboxRemove(op.id!);
        changed = true;
        continue;
      }
      if (op.kind !== "PATCH" || !op.body || Array.isArray(op.body) || !body || Array.isArray(body)) continue;
      const remaining = Object.fromEntries(Object.entries(op.body).filter(([k]) => !(k in body)));
      const remainingCount = Object.keys(remaining).length;
      if (remainingCount === 0) {
        await outboxRemove(op.id!);
        changed = true;
      } else if (remainingCount !== Object.keys(op.body).length) {
        await outboxPut({ ...op, body: remaining });
        changed = true;
      }
    }
    if (changed) notifyOutbox();
  } catch { /* pruning is best-effort — a failed prune only risks a redundant replay */ }
}

// ── Outbox replay ───────────────────────────────────────────
// FIFO replay of queued writes. Network failure stops the pass (still
// offline). Transient server errors (5xx/429 — a Supabase hiccup) keep the
// op and stop the pass so ordering holds; it retries on the next flush, up
// to MAX_REPLAY_ATTEMPTS. A definitive rejection (4xx) drops the op and
// surfaces via the reporter (retrying it forever would wedge the queue).
const MAX_REPLAY_ATTEMPTS = 5;
const isTransientServerError = (e: any) =>
  e?.status === 429 || (e?.status >= 500 && e?.status < 600);

// Queued ops don't stay valid forever: yesterday's RSVP toggle must not
// replay over what the user has since changed from a working connection.
// Scores get a long window — an offline round's scores still need to sync
// the next morning when the phone finds wifi.
const OP_MAX_AGE_MS: Record<string, number> = { event_signups: 6 * 3600_000 };
const DEFAULT_OP_MAX_AGE_MS = 48 * 3600_000;

let flushingOutbox = false;
export async function flushOutbox() {
  if (flushingOutbox) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushingOutbox = true;
  try {
    const ops = await outboxAll();
    for (const op of ops) {
      const ageMs = Date.now() - op.ts;
      if (ageMs > (OP_MAX_AGE_MS[op.table] ?? DEFAULT_OP_MAX_AGE_MS)) {
        await outboxRemove(op.id!);
        writeErrorReporter(`Discarded an unsynced ${op.table} change from ${Math.round(ageMs / 3600_000)}h ago — too old to sync safely`);
        continue;
      }
      try {
        if (op.kind === "UPSERT") await doUpsertFetch(op.table, op.body, op.onConflict);
        else await doRpcFetch(op.table, op.kind, op.body, op.query);
        await outboxRemove(op.id!);
      } catch (e: any) {
        if (isNetworkFailure(e)) break;
        const attempts = (op.attempts ?? 0) + 1;
        if (isTransientServerError(e) && attempts < MAX_REPLAY_ATTEMPTS) {
          await outboxPut({ ...op, attempts });
          break;
        }
        await outboxRemove(op.id!);
        writeErrorReporter(`Queued ${op.table} sync failed: ${e?.message || String(e)}`);
      }
    }
  } finally {
    flushingOutbox = false;
    notifyOutbox();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { flushOutbox(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) flushOutbox(); });
  setInterval(() => { if (navigator.onLine) flushOutbox(); }, 30_000);
  flushOutbox(); // replay anything left over from a previous session
}

// Minimal Supabase REST client (no npm install needed for Claude artifact preview)
export const supabase = (() => {
  const rpc = async (table: string, method: string, body?: any, query = "") => {
    try {
      const result = await doRpcFetch(table, method, body, query);
      if (method === "PATCH" || method === "DELETE") await supersedeQueuedOps(table, method, query, body);
      return result;
    } catch (e: any) {
      // Offline-first: idempotent writes are queued and replayed when the
      // network returns. Inserts are NOT queued — callers need the returned
      // row id, so they fail fast and visibly instead.
      if ((method === "PATCH" || method === "DELETE") && isNetworkFailure(e)) {
        await enqueueWrite({ table, kind: method, body, query });
        return [];
      }
      throw e;
    }
  };

  // Fetch ALL rows by paginating in chunks of 1000 (Supabase default limit)
  const fetchAll = async (table: string, cols = "*", orderCol = "created_at", extraQuery = "") => {
    // Primary key per table -- used as a stable tiebreaker for pagination
    const PK_MAP: Record<string, string> = {
      event_leaderboard: "summary_id",
      events: "event_id",
      golfers: "golfer_id",
      courses: "course_id",
      event_signups: "signup_id",
      hole_scores: "score_id",
      charity_donations: "id",
      event_images: "id",
      event_odds: "id",
      player_stats_cache: "golfer_id",
      hole_images: "hole_image_id",
    };
    const pk = PK_MAP[table] || "id";
  
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      const url = `${SUPABASE_URL}/rest/v1/${table}?select=${cols}&order=${orderCol}.asc,${pk}.asc&limit=${PAGE}&offset=${from}${extraQuery}`;
      const res = await fetch(url, { method: "GET", headers: restHeaders });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `GET ${table} failed (${res.status})`);
      }
      const page: any[] = await res.json();
      all = all.concat(page);
      if (page.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  return {
    from: (table: string) => ({
      select: (cols = "*", query = "") => fetchAll(table, cols, "created_at", query),
      selectById: (cols = "*") => fetchAll(table, cols, "id"),
      selectFiltered: (cols = "*", filterQuery = "", orderCol = "id") => fetchAll(table, cols, orderCol, filterQuery),
      insert: (data: any) => rpc(table, "POST", Array.isArray(data) ? data : [data]),
      upsert: async (data: any, onConflict?: string) => {
        try {
          const result = await doUpsertFetch(table, data, onConflict);
          // A direct upsert carries the full row — any queued op for the
          // same logical target is fully superseded.
          const key = opDedupeKey({ table, kind: "UPSERT", body: data, query: "", onConflict } as any);
          if (key) { await outboxRemoveWhere((o) => o.dedupeKey === key); notifyOutbox(); }
          return result;
        } catch (e: any) {
          // Upserts are idempotent — queue on network failure and replay later.
          if (isNetworkFailure(e)) {
            await enqueueWrite({ table, kind: "UPSERT", body: data, query: "", onConflict });
            return [];
          }
          throw e;
        }
      },
      update: (data: any, match: Record<string, any>) => {
        const q = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
        return rpc(table, "PATCH", data, `?${q}`);
      },
      delete: (match: Record<string, any>) => {
        const q = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
        return rpc(table, "DELETE", undefined, `?${q}`);
      },
    }),
    // Storage helpers for scorecard image uploads.
    // cache-control: one year, immutable. Safe because every upload path
    // embeds Date.now() in the filename (hole-5-<ts>.jpg, event_<id>_<ts>.jpg),
    // so a replaced image gets a new URL -- the filename IS the cache-buster,
    // and a stale long-lived cache entry can never be served for fresh content.
    // Without this header Supabase Storage defaults objects to no-cache, which
    // forces an origin revalidation (billed cached egress) on every view.
    storage: {
      upload: async (bucket:string, path:string, file:Blob):Promise<{url:string}|null>=>{
        const url=SUPABASE_URL+"/storage/v1/object/"+bucket+"/"+path;
        const res=await fetch(url,{method:"POST",headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":file.type,"cache-control":"public, max-age=31536000, immutable","x-upsert":"true"},body:file});
        if(!res.ok){
          const err=await res.text().catch(()=>"");
          console.error("Storage upload failed:",res.status,err);
          throw new Error("Upload failed: "+res.status+" "+err.slice(0,120));
        }
        return{url:SUPABASE_URL+"/storage/v1/object/public/"+bucket+"/"+path};
      },
      remove: async (bucket:string, paths:string[]):Promise<boolean>=>{
        const url=SUPABASE_URL+"/storage/v1/object/"+bucket;
        const res=await fetch(url,{method:"DELETE",headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({prefixes:paths})});
        return res.ok;
      },
    },
  };
})();
