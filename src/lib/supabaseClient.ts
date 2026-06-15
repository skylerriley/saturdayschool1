// ============================================================
// SUPABASE CLIENT
// Paste your project URL and anon key here (or use env vars).
// Get these from: Supabase dashboard -> Settings -> API
// ============================================================
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

// Minimal Supabase REST client (no npm install needed for Claude artifact preview)
// In your real Netlify project, replace this with: import { createClient } from '@supabase/supabase-js'
export const supabase = (() => {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };

  const rpc = async (table: string, method: string, body?: any, query = "") => {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `${method} ${table} failed (${res.status})`);
    }
    if (res.status === 204) return [];
    return res.json();
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
      const res = await fetch(url, { method: "GET", headers });
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
      upsert: (data: any, onConflict?: string) => {
        // Supabase upsert requires "resolution=merge-duplicates" in the Prefer header.
        // Without it, the on_conflict param is ignored and the row is inserted fresh
        // (or silently rejected as a duplicate), so corrections never reach the DB.
        const upsertHeaders = {
          ...headers,
          "Prefer": "resolution=merge-duplicates,return=representation",
        };
        const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`;
        const body = Array.isArray(data) ? data : [data];
        return fetch(url, { method: "POST", headers: upsertHeaders, body: JSON.stringify(body) })
          .then(async res => {
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.message || `upsert ${table} failed (${res.status})`);
            }
            if (res.status === 204) return [];
            return res.json();
          });
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
    // Storage helpers for scorecard image uploads
    storage: {
      upload: async (bucket:string, path:string, file:Blob):Promise<{url:string}|null>=>{
        const url=SUPABASE_URL+"/storage/v1/object/"+bucket+"/"+path;
        const res=await fetch(url,{method:"POST",headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":file.type,"x-upsert":"true"},body:file});
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
