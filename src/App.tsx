import { useState, useEffect, useCallback, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  LineController, BarController, ScatterController,
  Filler, Legend, Tooltip
} from "chart.js";
ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  LineController, BarController, ScatterController,
  Filler, Legend, Tooltip
);

// ============================================================
// SUPABASE CLIENT
// Paste your project URL and anon key here (or use env vars).
// Get these from: Supabase dashboard -> Settings -> API
// ============================================================
const SUPABASE_URL  = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL)  || "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_KEY  = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || "YOUR_ANON_KEY_HERE";

// Minimal Supabase REST client (no npm install needed for Claude artifact preview)
// In your real Netlify project, replace this with: import { createClient } from '@supabase/supabase-js'
const supabase = (() => {
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
      insert: (data: any) => rpc(table, "POST", Array.isArray(data) ? data : [data]),
      upsert: (data: any, onConflict?: string) =>
        rpc(table, "POST", Array.isArray(data) ? data : [data],
          onConflict ? `?on_conflict=${onConflict}` : ""),
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

// ============================================================
// CSS - DM Sans / DM Serif, larger accessible fonts
// ============================================================
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');

  :root {
    --green-900:#0a2e1a; --green-800:#0f4526; --green-700:#155c32;
    --green-600:#1a7340; --green-500:#228b50; --green-400:#2db368;
    --green-300:#5cc98a; --green-100:#d4f2e3; --green-50:#edf9f2;
    --gold-900:#3d2400;  --gold-800:#6b3d00;  --gold-700:#9a5a00;
    --gold-600:#c47800;  --gold-500:#e09400;  --gold-400:#f5b000;
    --gold-300:#ffc947;  --gold-100:#fff2cc;  --gold-50:#fffaf0;
    --red-800:#7a1515;   --red-600:#c02020;   --red-400:#e84040;   --red-100:#fde8e8;
    --earth-900:#1c1410; --earth-800:#2e221a; --earth-700:#4a3728;
    --earth-600:#6b5240; --earth-400:#9c7c65; --earth-200:#d4c4b8;
    --earth-100:#ede6e0; --earth-50:#f7f4f1;
    --bg:#f4f1ec; --surface:#ffffff; --surface2:#f9f7f4;
    --border:rgba(74,55,40,0.15); --border-md:rgba(74,55,40,0.25);
    --text-primary:#1c1410; --text-secondary:#6b5240; --text-muted:#9c7c65;
    --radius-sm:6px; --radius-md:10px; --radius-lg:16px; --radius-xl:24px;
    --shadow-sm:0 1px 3px rgba(28,20,16,0.08);
    --shadow-md:0 4px 16px rgba(28,20,16,0.10);
  }

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body,#root{width:100%;overflow-x:hidden;}

  body{
    font-family:'DM Sans',sans-serif;
    background:var(--bg);
    color:var(--text-primary);
    font-size:17px;
    line-height:1.55;
    min-height:100vh;
  }

  .app-shell{
    width:100%; max-width:500px; min-width:320px;
    margin:0 auto; min-height:100vh;
    display:flex; flex-direction:column;
    background:var(--bg); overflow-x:hidden;
  }

  /* ── HEADER ── */
  .app-header{background:var(--green-900);position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(0,0,0,0.3);width:100%;}
  .header-top{display:flex;align-items:center;justify-content:space-between;padding:12px 18px 8px;}
  .brand-name{font-size:22px;font-weight:700;color:var(--gold-400);letter-spacing:0.01em;line-height:1.1;}
  .brand-tagline{font-size:11px;color:var(--green-300);letter-spacing:0.12em;text-transform:uppercase;font-weight:500;}
  .header-badge{background:var(--gold-500);color:var(--green-900);font-size:12px;font-weight:700;letter-spacing:0.06em;padding:5px 12px;border-radius:20px;cursor:pointer;border:none;text-transform:uppercase;}

  .nav-tabs{display:flex;overflow-x:auto;scrollbar-width:none;border-top:1px solid rgba(255,255,255,0.08);}
  .nav-tabs::-webkit-scrollbar{display:none;}
  .nav-tab{flex-shrink:0;padding:11px 16px;font-size:14px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:rgba(255,255,255,0.5);background:none;border:none;border-bottom:2.5px solid transparent;cursor:pointer;transition:color 0.2s,border-color 0.2s;white-space:nowrap;}
  .nav-tab.active{color:var(--gold-300);border-bottom-color:var(--gold-400);}
  .nav-tab:hover:not(.active){color:rgba(255,255,255,0.8);}

  .main-content{flex:1;padding:16px 18px;width:100%;min-width:0;overflow-x:hidden;}

  /* ── TYPOGRAPHY ── */
  .section-title{font-family:'DM Serif Display',serif;font-size:26px;font-weight:400;color:var(--green-800);margin-bottom:3px;}
  .section-sub{font-size:14px;color:var(--text-muted);margin-bottom:18px;font-weight:400;}
  .card-title{font-size:13px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--green-700);}

  /* ── CARDS ── */
  .card{background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);padding:16px;margin-bottom:12px;box-shadow:var(--shadow-sm);}

  /* ── BUTTONS ── */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:12px 20px;border-radius:var(--radius-md);font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;letter-spacing:0.03em;cursor:pointer;border:none;transition:all 0.15s;text-decoration:none;}
  .btn-primary{background:var(--green-700);color:#fff;}
  .btn-primary:hover{background:var(--green-600);transform:translateY(-1px);}
  .btn-gold{background:var(--gold-500);color:var(--green-900);}
  .btn-gold:hover{background:var(--gold-400);}
  .btn-outline{background:transparent;color:var(--green-700);border:1.5px solid var(--green-600);}
  .btn-outline:hover{background:var(--green-50);}
  .btn-danger{background:var(--red-600);color:white;}
  .btn-sm{padding:8px 14px;font-size:13px;}
  .btn-full{width:100%;}
  .btn:disabled{opacity:0.45;cursor:not-allowed;transform:none!important;}

  /* ── FORMS ── */
  .form-group{margin-bottom:16px;}
  .form-label{display:block;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:6px;}
  .form-input,.form-select{width:100%;padding:11px 14px;border:1.5px solid var(--border-md);border-radius:var(--radius-md);font-family:'DM Sans',sans-serif;font-size:16px;color:var(--text-primary);background:var(--surface);transition:border-color 0.15s;outline:none;}
  .form-input:focus,.form-select:focus{border-color:var(--green-500);box-shadow:0 0 0 3px rgba(34,139,80,0.12);}
  textarea.form-input{font-size:15px;}

  /* ── PILLS ── */
  .pill{display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;}
  .pill-green{background:var(--green-100);color:var(--green-700);}
  .pill-gold{background:var(--gold-100);color:var(--gold-700);}
  .pill-red{background:var(--red-100);color:var(--red-600);}
  .pill-earth{background:var(--earth-100);color:var(--earth-600);}
  .pill-gray{background:var(--earth-100);color:var(--text-muted);}
  .pill-blue{background:#e8f0fe;color:#1a56a0;}

  /* ── ESPN-STYLE LEADERBOARD ── */
  .lb-header{
    display:grid;
    grid-template-columns:36px 1fr 64px 56px;
    gap:0;
    padding:7px 14px;
    background:var(--green-900);
    border-radius:var(--radius-md) var(--radius-md) 0 0;
    margin-bottom:0;
  }
  .lb-header-cell{font-size:11px;text-align: left;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:var(--gold-300);}
  .lb-header-cell.right{text-align:right;}

  .lb-row{
    display:grid;
    grid-template-columns:36px 1fr 64px 56px;
    gap:0;
    padding:13px 14px;
    background:var(--surface);
    border-bottom:1px solid var(--border);
    cursor:pointer;
    transition:background 0.15s;
    align-items:center;
  }
  .lb-row:last-child{border-bottom:none;border-radius:0 0 var(--radius-md) var(--radius-md);}
  .lb-row:first-of-type{} 
  .lb-row:hover{background:var(--green-50);}
  .lb-row.expanded{background:var(--green-50);}

  .lb-rank-cell{font-size:20px;font-weight:700;color:var(--earth-400);line-height:1;}
  .lb-rank-cell.r1{color:var(--gold-500);}
  .lb-rank-cell.r2{color:#888;}
  .lb-rank-cell.r3{color:var(--earth-600);}

  .lb-name-cell{min-width:0;}
  .lb-name-main{font-size:17px;text-align: left;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .lb-name-sub{font-size:13px;color:var(--text-muted);margin-top:1px;}

  .lb-score-cell{text-align:right;}
  .lb-score-big{font-size:24px;font-weight:700;color:var(--green-700);line-height:1;}
  .lb-score-label{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;}

  .lb-thru-cell{text-align:right;}
  .lb-thru-big{font-size:17px;font-weight:600;color:var(--text-secondary);}
  .lb-thru-label{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;}

  /* expanded player detail panel */
  .lb-detail{
    background:var(--surface2);
    border-bottom:1px solid var(--border);
    padding:14px 16px;
    animation:fadeDown 0.2s ease;
  }
  @keyframes fadeDown{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:translateY(0);}}
  .lb-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;}
  .lb-detail-item{}
  .lb-detail-key{font-size:12px;color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:0.06em;}
  .lb-detail-val{font-size:18px;font-weight:700;color:var(--text-primary);line-height:1.2;}

  /* hole-by-hole mini grid inside detail panel */
  .hbh-grid{display:grid;grid-template-columns:repeat(9,1fr);gap:3px;margin-top:10px;}
  .hbh-grid-full{grid-template-columns:repeat(9,1fr);}
  .hbh-cell{border-radius:4px;padding:4px 2px;text-align:center;font-size:12px;font-weight:700;background:var(--earth-100);color:var(--earth-700);}
  .hbh-cell.eagle{background:var(--gold-100);color:var(--gold-800);}
  .hbh-cell.birdie{background:var(--green-100);color:var(--green-700);}
  .hbh-cell.par{background:#f0f0f0;color:#555;}
  .hbh-cell.bogey{background:#fff3e0;color:#b35c00;}
  .hbh-cell.dbl{background:var(--red-100);color:var(--red-600);}
  .hbh-cell.header{background:var(--green-900);color:var(--gold-300);font-size:11px;}

  /* Golf scorecard -- score symbols */
  .sc-score{display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;width:24px;height:24px;line-height:1;}
  .sc-eagle{border-radius:50%;border:2px solid var(--gold-500);outline:2px solid var(--gold-500);outline-offset:2px;background:var(--gold-50);color:var(--gold-800);}
  .sc-birdie{border-radius:50%;border:2px solid var(--green-500);background:var(--green-50);color:var(--green-700);}
  .sc-par{color:var(--text-primary);}
  .sc-bogey{border:2px solid var(--earth-600);background:var(--earth-50);color:var(--earth-800);}
  .sc-dbl{border:2px solid var(--red-600);outline:2px solid var(--red-600);outline-offset:2px;background:var(--red-100);color:var(--red-800);}
  .sc-triple{background:var(--red-800);color:white;border-radius:2px;}

  /* Scorecard table */
  .scorecard-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:10px;}
  .scorecard-table{border-collapse:collapse;font-size:12px;min-width:360px;width:100%;}
  .scorecard-table th{background:var(--green-900);color:var(--gold-300);font-weight:700;padding:5px 3px;text-align:center;font-size:11px;white-space:nowrap;}
  .scorecard-table th.label-col{text-align:left;padding-left:8px;min-width:52px;}
  .scorecard-table td{padding:5px 3px;text-align:center;border-bottom:1px solid var(--border);}
  .scorecard-table td.label-col{text-align:left;padding-left:8px;font-weight:600;font-size:11px;color:var(--text-secondary);white-space:nowrap;}
  .scorecard-table .total-col{background:var(--green-50);font-weight:700;font-size:13px;color:var(--green-800);}
  .scorecard-table tr:nth-child(even) td:not(.label-col){background:var(--surface2);}

  /* ── SCORE GRID ── */
  .score-grid{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}
  .score-table{min-width:300px;border-collapse:collapse;font-size:14px;width:100%;}
  .score-table th{background:var(--green-900);color:var(--gold-300);font-size:12px;font-weight:700;letter-spacing:0.06em;padding:8px 5px;text-align:center;white-space:nowrap;}
  .score-table td{padding:8px 4px;text-align:center;border-bottom:1px solid var(--border);font-size:14px;}
  .score-table tr:nth-child(even) td{background:var(--surface2);}
  .score-input-cell input{width:40px;padding:5px 2px;text-align:center;border:1.5px solid var(--border-md);border-radius:5px;font-size:15px;font-family:'DM Sans',sans-serif;}
  .score-input-cell input::-webkit-outer-spin-button,
  .score-input-cell input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
  .score-input-cell input[type=number]{-moz-appearance:textfield;appearance:textfield;}
  .score-input-cell input:focus{border-color:var(--green-500);outline:none;box-shadow:0 0 0 2px rgba(34,139,80,0.15);}
  .pts-eagle{background:var(--gold-100);color:var(--gold-800);font-weight:700;}
  .pts-birdie{background:var(--green-100);color:var(--green-700);font-weight:700;}
  .pts-par{background:#f0f0f0;color:#555;}
  .pts-bogey{background:#fff3e0;color:#b35c00;}
  .pts-zero{background:var(--red-100);color:var(--red-600);}

  /* ── STAT CARDS ── */
  .stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:16px;}
  .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 12px;text-align:center;}
  .stat-value{font-size:30px;font-weight:700;color:var(--green-700);line-height:1;margin-bottom:4px;}
  .stat-label{font-size:13px;color:var(--text-muted);font-weight:500;}

  /* ── TOGGLE ── */
  .toggle-group{display:flex;background:var(--earth-100);border-radius:var(--radius-md);padding:3px;margin-bottom:16px;}
  .toggle-btn{flex:1;padding:10px;border:none;border-radius:var(--radius-sm);background:transparent;font-size:14px;font-weight:600;color:var(--text-muted);cursor:pointer;transition:all 0.2s;}
  .toggle-btn.active{background:var(--green-800);color:white;box-shadow:var(--shadow-sm);}

  /* ── PAIRINGS ── */
  .pairing-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;overflow:hidden;}
  .pairing-header{background:var(--green-800);padding:9px 14px;display:flex;align-items:center;justify-content:space-between;}
  .pairing-time{font-size:15px;font-weight:700;color:var(--gold-300);letter-spacing:0.04em;}
  .pairing-group{font-size:12px;color:var(--green-300);letter-spacing:0.08em;text-transform:uppercase;}
  .pairing-body{padding:10px 14px;}
  .pairing-player{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:15px;}
  .pairing-player:last-child{border-bottom:none;}
  .pairing-hcp{font-size:14px;color:var(--green-600);font-weight:600;}

  /* ── RSVP ── */
  .rsvp-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1.5px solid var(--border-md);gap:8px;}
  .rsvp-row:last-child{border-bottom:none;}
  .rsvp-name{font-size:16px;font-weight:500;flex:1;min-width:0;text-align:left;}
  .rsvp-actions{display:flex;gap:5px;flex-shrink:0;}
  .rsvp-btn{padding:7px 14px;border-radius:20px;font-size:13px;font-weight:600;border:1.5px solid;cursor:pointer;transition:all 0.15s;background:transparent;}
  .rsvp-btn.yes{border-color:var(--green-500);color:var(--green-700);}
  .rsvp-btn.yes.active{background:var(--green-700);color:white;border-color:var(--green-700);}
  .rsvp-btn.no{border-color:var(--red-400);color:var(--red-600);}
  .rsvp-btn.no.active{background:var(--red-600);color:white;border-color:var(--red-600);}

  /* ── MISC ── */
  .divider{border:none;border-top:1px solid var(--border);margin:18px 0;}
  .fin-table{width:100%;border-collapse:collapse;font-size:15px;}
  .fin-table th{background:var(--green-50);color:var(--green-800);font-size:12px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;padding:9px 10px;text-align:left;border-bottom:2px solid rgba(92,201,138,0.25);}
  .fin-table td{padding:10px 10px;border-bottom:1px solid var(--border);vertical-align:middle;}
  .fin-table tr:last-child td{border-bottom:none;}
  .money{font-weight:700;color:var(--green-700);}

  .podium-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;}
  .podium-card{border-radius:var(--radius-md);padding:16px 10px;text-align:center;border:1px solid var(--border);}
  .podium-card.p1{background:linear-gradient(145deg,var(--gold-50),var(--gold-100));border-color:var(--gold-300);}
  .podium-card.p2{background:var(--surface2);}
  .podium-pos{font-size:26px;line-height:1;}
  .podium-pname{font-size:15px;font-weight:600;color:var(--text-primary);margin-top:5px;line-height:1.2;}
  .podium-pscore{font-size:24px;font-weight:700;color:var(--green-700);margin-top:2px;}
  .podium-payout{font-size:14px;color:var(--gold-600);font-weight:600;margin-top:2px;}

  .success-banner{background:var(--green-100);border:1px solid var(--green-300);border-radius:var(--radius-md);padding:13px 16px;color:var(--green-800);font-size:15px;margin-bottom:12px;display:flex;align-items:center;gap:9px;}

  .tab-sub{display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;scrollbar-width:none;}
  .tab-sub::-webkit-scrollbar{display:none;}
  .tab-sub-btn{flex-shrink:0;padding:8px 16px;border-radius:20px;font-size:13px;text-transform: uppercase; font-weight:600;letter-spacing:0.03em;border:1.5px solid var(--border-md);background:transparent;color:var(--text-muted);cursor:pointer;transition:all 0.15s;}
  .tab-sub-btn.active{background:var(--green-800);border-color:var(--green-800);color:white;}

  .empty-state{text-align:center;padding:40px 20px;color:var(--text-muted);}
  .empty-text{font-size:17px;margin-bottom:4px;color:var(--text-secondary);}
  .empty-sub{font-size:14px;}

  .info-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);font-size:15px;gap:8px;}
  .info-row:last-child{border-bottom:none;}
  .info-key{color:var(--text-muted);font-weight:400;flex-shrink:0;}
  .info-val{font-weight:500;color:var(--text-primary);text-align:right;min-width:0;word-break:break-word;}

  .charity-hero{background:var(--green-900);border-radius:var(--radius-lg);padding:26px 20px;text-align:center;margin-bottom:14px;}
  .charity-amount{font-family:'DM Serif Display',serif;font-size:52px;font-weight:400;color:var(--gold-400);line-height:1;}
  .charity-label{font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--green-300);margin-top:7px;font-weight:600;}

  .hcp-table{width:100%;border-collapse:collapse;font-size:14px;}
  .hcp-table th{background:var(--green-900);color:var(--gold-300);font-size:12px;font-weight:700;padding:9px 6px;text-align:center;white-space:nowrap;}
  .hcp-table th:first-child{text-align:left;padding-left:12px;}
  .hcp-table td{padding:9px 6px;border-bottom:1px solid var(--border);text-align:center;font-size:14px;}
  .hcp-table td:first-child{text-align:left;padding-left:12px;font-weight:500;}
  .hcp-table tr:nth-child(even) td{background:var(--surface2);}

  .guest-tag{font-size:11px;color:var(--gold-700);background:var(--gold-50);border:1px solid #ffeea0;border-radius:4px;padding:2px 6px;margin-left:5px;font-weight:600;}

  /* year pill selector */
  .year-row{display:flex;gap:7px;margin-bottom:14px;overflow-x:auto;scrollbar-width:none;}
  .year-row::-webkit-scrollbar{display:none;}
  .year-pill{flex-shrink:0;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;border:1.5px solid var(--border-md);background:transparent;color:var(--text-muted);cursor:pointer;transition:all 0.15s;}
  .year-pill.active{background:var(--gold-600);border-color:var(--gold-600);color:white;}

  /* multi-golfer score section cards */
  .scorer-card{background:var(--surface);border:1.5px solid var(--border-md);border-radius:var(--radius-lg);padding:14px;margin-bottom:12px;}
  .scorer-card.active-scorer{border-color:var(--green-400);}
  .scorer-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
  .scorer-num{font-size:13px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--green-700);}

  /* skins warning */
  .skins-warning{background:var(--gold-50);border:1.5px solid var(--gold-300);border-radius:var(--radius-md);padding:12px 14px;font-size:14px;color:var(--gold-800);margin-bottom:12px;display:flex;gap:9px;align-items:flex-start;}
  @keyframes spin{to{transform:rotate(360deg);}}
  @keyframes pinShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
  .pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--green-600);transition:background 0.15s;}
  .pin-dot.filled{background:var(--green-600);}
  @keyframes livePulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.3;transform:scale(0.75);}}
  .live-dot{display:inline-block;width:8px;height:8px;background:#e84040;border-radius:50%;margin-right:5px;animation:livePulse 1.3s ease-in-out infinite;vertical-align:middle;}
  .lb-live-row{display:grid;grid-template-columns:44px 1fr 56px 52px;align-items:center;padding:12px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s;}
  .lb-live-row:active{background:var(--green-50);}
`;

// ============================================================
// SEED DATA (with season field for multi-year support)
// ============================================================
const INITIAL_GOLFERS = [
  {golfer_id:1,  first_name:"Mark",    last_name:"Stein",      email_address:"mark@example.com",    current_handicap_index:12.4, is_guest:false, status:"Active"},
  {golfer_id:2,  first_name:"Trevor",  last_name:"Gnesin",     email_address:"trevor.g@example.com",current_handicap_index:23.0, is_guest:false, status:"Active"},
  {golfer_id:3,  first_name:"Stuart",  last_name:"Solkow",     email_address:"stuart@example.com",  current_handicap_index:12.0, is_guest:false, status:"Active"},
  {golfer_id:4,  first_name:"Trevor",  last_name:"Colley",     email_address:"trevor.c@example.com",current_handicap_index:14.3, is_guest:false, status:"Active"},
  {golfer_id:5,  first_name:"Tony",    last_name:"Del Duca",   email_address:"tony@example.com",    current_handicap_index:8.0,  is_guest:false, status:"Active"},
  {golfer_id:6,  first_name:"Dave",    last_name:"Metz",       email_address:"dave@example.com",    current_handicap_index:14.8, is_guest:false, status:"Active"},
  {golfer_id:7,  first_name:"Skyler",  last_name:"Riley",      email_address:"skyler@example.com",  current_handicap_index:9.3,  is_guest:false, status:"Active"},
  {golfer_id:8,  first_name:"Don",     last_name:"Blaustein",  email_address:"don@example.com",     current_handicap_index:16.2, is_guest:false, status:"Active"},
  {golfer_id:9,  first_name:"Joe",     last_name:"Fishman",    email_address:"joe@example.com",     current_handicap_index:19.0, is_guest:false, status:"Active"},
  {golfer_id:10, first_name:"Jake",    last_name:"Ritter",     email_address:"jake@example.com",    current_handicap_index:1.0,  is_guest:false, status:"Active"},
  {golfer_id:11, first_name:"Pete",    last_name:"Grande",     email_address:"pete@example.com",    current_handicap_index:12.0, is_guest:false, status:"Active"},
  {golfer_id:12, first_name:"Errol",   last_name:"Kaplan",     email_address:"errol@example.com",   current_handicap_index:19.1, is_guest:false, status:"Active"},
];

const INITIAL_COURSES = [
  {course_id:1, course_name:"Strawberry Farms GC", tee_box_name:"Black", tee_slope:132, tee_rating:74.1, par:71, hole_pars:[4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,3], hole_stroke_indices:[5,13,17,3,11,7,15,1,9,6,16,2,10,8,18,4,14,12]},
  {course_id:2, course_name:"Strawberry Farms GC", tee_box_name:"Blue",  tee_slope:126, tee_rating:72.3, par:71, hole_pars:[4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,3], hole_stroke_indices:[5,13,17,3,11,7,15,1,9,6,16,2,10,8,18,4,14,12]},
  {course_id:3, course_name:"Strawberry Farms GC", tee_box_name:"White", tee_slope:119, tee_rating:70.1, par:71, hole_pars:[4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,3], hole_stroke_indices:[5,13,17,3,11,7,15,1,9,6,16,2,10,8,18,4,14,12]},
  {course_id:4, course_name:"Oak Creek GC",         tee_box_name:"Blue",  tee_slope:133, tee_rating:73.8, par:72, hole_pars:[5,4,3,4,4,5,4,3,4,4,4,3,5,4,4,3,5,4], hole_stroke_indices:[3,11,17,7,13,1,9,15,5,10,16,18,2,12,6,14,4,8]},
  {course_id:5, course_name:"Oak Creek GC",         tee_box_name:"White", tee_slope:124, tee_rating:71.5, par:72, hole_pars:[5,4,3,4,4,5,4,3,4,4,4,3,5,4,4,3,5,4], hole_stroke_indices:[3,11,17,7,13,1,9,15,5,10,16,18,2,12,6,14,4,8]},
];

// Events have a `season` (year) field for multi-year support
const INITIAL_EVENTS = [
  {event_id:1, season:2025, date:"2025-05-10", course_name:"Strawberry Farms GC", tee_times:["08:00","08:10","08:20","08:30"], status:"Completed"},
  {event_id:2, season:2025, date:"2025-05-17", course_name:"Strawberry Farms GC", tee_times:["08:00","08:10","08:20"],         status:"Completed"},
  {event_id:3, season:2025, date:"2025-05-24", course_name:"Oak Creek GC",         tee_times:["08:00","08:10","08:20"],         status:"Completed"},
  {event_id:4, season:2026, date:"2026-05-16", course_name:"Strawberry Farms GC", tee_times:["08:00","08:10","08:20","08:30"], status:"Completed"},
  {event_id:5, season:2026, date:"2026-05-23", course_name:"Strawberry Farms GC", tee_times:["08:00","08:10","08:20"],         status:"Pairings Set"},
  {event_id:6, season:2026, date:"2026-05-30", course_name:"Oak Creek GC",         tee_times:["08:00","08:10","08:20"],         status:"Upcoming"},
  {event_id:7, season:2026, date:"2026-06-06", course_name:"Strawberry Farms GC", tee_times:["08:00","08:10","08:20"],         status:"Upcoming"},
];

const mk = (sid:number,eid:number,gid:number,pts:number,buy:boolean,skin:boolean,ch:boolean,wpay:number,spay:number,type="Total Only") =>
  ({summary_id:sid, event_id:eid, golfer_id:gid, season: eid<=3?2025:2026, entry_type:type, total_stableford_points:pts, buy_in_paid:buy, skins_paid:skin, charity_paid:ch, weekly_payout_won:wpay, skins_payout_won:spay});

const INITIAL_LEADERBOARD = [
  // 2025 event 1
  mk(1,1,10,38,true,true,true,300,0,"Hole-by-Hole"),   mk(2,1,5,35,true,true,true,100,40,"Hole-by-Hole"),
  mk(3,1,7,33,true,true,true,0,40,"Hole-by-Hole"),     mk(4,1,1,31,true,true,true,0,20,"Hole-by-Hole"),
  mk(5,1,3,30,true,false,true,0,0),                    mk(6,1,4,29,true,true,true,0,0),
  mk(7,1,6,28,true,true,true,0,0),                     mk(8,1,8,26,true,false,true,0,0),
  mk(9,1,9,25,true,false,true,0,0),                    mk(10,1,11,24,true,true,true,0,0),
  mk(11,1,2,23,true,false,false,0,0),                  mk(12,1,12,21,true,false,true,0,0),
  // 2025 event 2
  mk(13,2,5,37,true,true,true,300,0,"Hole-by-Hole"),   mk(14,2,10,34,true,true,true,100,30,"Hole-by-Hole"),
  mk(15,2,7,32,true,true,true,0,30,"Hole-by-Hole"),    mk(16,2,11,31,true,true,true,0,60,"Hole-by-Hole"),
  mk(17,2,1,30,true,false,true,0,0),                   mk(18,2,3,29,true,true,true,0,0),
  mk(19,2,4,27,true,true,true,0,0),                    mk(20,2,6,26,true,true,true,0,0),
  mk(21,2,8,25,true,false,true,0,0),                   mk(22,2,9,24,true,false,true,0,0),
  mk(23,2,2,22,true,false,false,0,0),                  mk(24,2,12,20,true,false,true,0,0),
  // 2025 event 3
  mk(25,3,7,40,true,true,true,300,0,"Hole-by-Hole"),   mk(26,3,1,36,true,true,true,100,50,"Hole-by-Hole"),
  mk(27,3,10,35,true,true,true,0,50,"Hole-by-Hole"),   mk(28,3,5,33,true,true,true,0,20,"Hole-by-Hole"),
  mk(29,3,3,31,true,false,true,0,0),                   mk(30,3,11,30,true,true,true,0,0),
  mk(31,3,4,28,true,true,true,0,0),                    mk(32,3,6,27,true,true,true,0,0),
  mk(33,3,8,25,true,false,true,0,0),                   mk(34,3,9,24,true,false,true,0,0),
  mk(35,3,2,22,true,false,false,0,0),                  mk(36,3,12,21,true,false,true,0,0),
  // 2026 event 4
  mk(37,4,4,39,true,true,true,300,0,"Hole-by-Hole"),   mk(38,4,7,35,true,true,true,100,40,"Hole-by-Hole"),
  mk(39,4,2,34,true,true,true,0,40,"Hole-by-Hole"),    mk(40,4,11,32,true,true,true,0,20,"Hole-by-Hole"),
  mk(41,4,9,31,true,false,true,0,0),                   mk(42,4,1,30,true,true,true,0,0),
  mk(43,4,10,29,true,false,true,0,0),                  mk(44,4,6,28,true,true,true,0,0),
  mk(45,4,3,27,true,false,true,0,0),                   mk(46,4,8,26,true,true,true,0,0),
  mk(47,4,5,24,true,false,false,0,0),                  mk(48,4,12,22,true,false,true,0,0),
];

const INITIAL_HOLE_SCORES:any[] = [];

// Extra charity donations (outside rounds)
const INITIAL_CHARITY_DONATIONS = [
  {id:1, amount:50, note:"Tony's birthday donation", date:"2025-06-01"},
  {id:2, amount:100, note:"Year-end raffle proceeds", date:"2025-12-15"},
];

const INITIAL_SIGNUPS = [
  ...[1,2,3,4,5,6,7,8,9,10,11,12].map((gid,i)=>({signup_id:i+1,event_id:5,golfer_id:gid,attending:gid<=8?"Yes":gid===9?"No":"Unconfirmed",assigned_tee_time:gid<=4?"08:00":gid<=8?"08:10":null,tee_box_course_id:gid<=4?2:gid<=8?3:null,playing_handicap:null,is_guest_entry:false,sponsor_golfer_id:null})),
  ...[1,2,3,4,5,6,7,8,9,10,11,12].map((gid,i)=>({signup_id:i+13,event_id:6,golfer_id:gid,attending:"Unconfirmed",assigned_tee_time:null,tee_box_course_id:null,playing_handicap:null,is_guest_entry:false,sponsor_golfer_id:null})),
  ...[1,2,3,4,5,6,7,8,9,10,11,12].map((gid,i)=>({signup_id:i+25,event_id:7,golfer_id:gid,attending:"Unconfirmed",assigned_tee_time:null,tee_box_course_id:null,playing_handicap:null,is_guest_entry:false,sponsor_golfer_id:null})),
];

const EXTRA_ROUNDS_BY_GOLFER:Record<number,{pts:number,season:number}[]> = {
  1: [{pts:31,season:2025},{pts:29,season:2025},{pts:28,season:2025},{pts:33,season:2025},{pts:30,season:2025},{pts:27,season:2025},{pts:32,season:2025},{pts:34,season:2025},{pts:29,season:2025},{pts:28,season:2025},{pts:30,season:2025},{pts:31,season:2025}],
  2: [{pts:25,season:2025},{pts:24,season:2025},{pts:26,season:2025},{pts:25,season:2025},{pts:23,season:2025},{pts:25,season:2025},{pts:24,season:2025},{pts:26,season:2025},{pts:25,season:2025},{pts:24,season:2025},{pts:26,season:2025},{pts:25,season:2025}],
  3: [{pts:31,season:2025},{pts:30,season:2025},{pts:28,season:2025},{pts:33,season:2025},{pts:29,season:2025},{pts:30,season:2025},{pts:32,season:2025},{pts:31,season:2025},{pts:29,season:2025},{pts:28,season:2025},{pts:31,season:2025},{pts:30,season:2025}],
  4: [{pts:30,season:2025},{pts:29,season:2025},{pts:31,season:2025},{pts:28,season:2025},{pts:32,season:2025},{pts:30,season:2025},{pts:29,season:2025},{pts:31,season:2025},{pts:30,season:2025},{pts:28,season:2025},{pts:29,season:2025},{pts:31,season:2025}],
  5: [{pts:34,season:2025},{pts:35,season:2025},{pts:33,season:2025},{pts:36,season:2025},{pts:34,season:2025},{pts:35,season:2025},{pts:33,season:2025},{pts:36,season:2025},{pts:34,season:2025},{pts:35,season:2025},{pts:33,season:2025},{pts:34,season:2025}],
  6: [{pts:29,season:2025},{pts:28,season:2025},{pts:30,season:2025},{pts:27,season:2025},{pts:31,season:2025},{pts:29,season:2025},{pts:28,season:2025},{pts:30,season:2025},{pts:29,season:2025},{pts:27,season:2025},{pts:28,season:2025},{pts:30,season:2025}],
  7: [{pts:32,season:2025},{pts:33,season:2025},{pts:31,season:2025},{pts:34,season:2025},{pts:32,season:2025},{pts:33,season:2025},{pts:31,season:2025},{pts:34,season:2025},{pts:32,season:2025},{pts:33,season:2025},{pts:31,season:2025},{pts:32,season:2025}],
  8: [{pts:26,season:2025},{pts:25,season:2025},{pts:28,season:2025},{pts:27,season:2025},{pts:24,season:2025},{pts:26,season:2025},{pts:25,season:2025},{pts:28,season:2025},{pts:26,season:2025},{pts:24,season:2025},{pts:27,season:2025},{pts:25,season:2025}],
  9: [{pts:25,season:2025},{pts:24,season:2025},{pts:26,season:2025},{pts:23,season:2025},{pts:27,season:2025},{pts:25,season:2025},{pts:24,season:2025},{pts:26,season:2025},{pts:25,season:2025},{pts:23,season:2025},{pts:24,season:2025},{pts:26,season:2025}],
  10:[{pts:35,season:2025},{pts:36,season:2025},{pts:34,season:2025},{pts:37,season:2025},{pts:35,season:2025},{pts:36,season:2025},{pts:34,season:2025},{pts:37,season:2025},{pts:35,season:2025},{pts:36,season:2025},{pts:34,season:2025},{pts:35,season:2025}],
  11:[{pts:31,season:2025},{pts:30,season:2025},{pts:32,season:2025},{pts:29,season:2025},{pts:33,season:2025},{pts:31,season:2025},{pts:30,season:2025},{pts:32,season:2025},{pts:31,season:2025},{pts:29,season:2025},{pts:30,season:2025},{pts:32,season:2025}],
  12:[{pts:24,season:2025},{pts:23,season:2025},{pts:25,season:2025},{pts:22,season:2025},{pts:26,season:2025},{pts:24,season:2025},{pts:23,season:2025},{pts:25,season:2025},{pts:24,season:2025},{pts:22,season:2025},{pts:23,season:2025},{pts:25,season:2025}],
};

// ============================================================
// BUSINESS LOGIC
// ============================================================
function calcPlayingHandicap(hcp:number,slope:number,rating:number,par:number){return Math.round(hcp*(slope/113)+(rating-par));}
function calcHoleNetScore(gross:number,phcp:number,si:number){
  if(!gross||isNaN(gross)||!phcp&&phcp!==0)return gross;
  const b=Math.floor(phcp/18),e=phcp%18;
  return gross-b-(si<=e?1:0);
}
function calcStablefordPoints(net:number,par:number){const d=net-par;if(d<=-2)return 4;if(d===-1)return 3;if(d===0)return 2;if(d===1)return 1;return 0;}
function calcHoleScores(grossScores:any[],phcp:number,course:any){
  return grossScores.map((g,i)=>{
    const gross=g&&String(g).trim()!=""?parseInt(String(g)):null;
    if(!gross||isNaN(gross))return{gross:null,net:null,points:null};
    const net=calcHoleNetScore(gross,phcp,course.hole_stroke_indices[i]);
    if(isNaN(net))return{gross,net:null,points:null};
    return{gross,net,points:calcStablefordPoints(net,course.hole_pars[i])};
  });
}
function runPairingEngine(attendees:{golfer_id:number,sponsor_golfer_id:number|null}[],teeTimes:string[]){
  const sponsorMap:Record<number,number[]>={};
  const soloIds:number[]=[];
  attendees.forEach(a=>{if(a.sponsor_golfer_id){(sponsorMap[a.sponsor_golfer_id]=sponsorMap[a.sponsor_golfer_id]||[]).push(a.golfer_id);}else{soloIds.push(a.golfer_id);}});
  const seeds=soloIds.map(id=>[id,...(sponsorMap[id]||[])]);
  const shuffled=[...seeds].sort(()=>Math.random()-0.5);
  const pool=shuffled.flat();
  const N=pool.length,G=Math.ceil(N/4),base=Math.floor(N/G),R=N%G;
  const groups:number[][]=[];
  let idx=0;
  for(let g=0;g<G;g++){const size=g<R?base+1:base;groups.push(pool.slice(idx,idx+size));idx+=size;}
  return groups.map((players,i)=>({teeTime:teeTimes[i]||teeTimes[teeTimes.length-1],players}));
}
function golferName(golfers:any[],id:number){const g=golfers.find(x=>x.golfer_id===id);return g?`${g.first_name} ${g.last_name}`:"Guest";}
function formatDate(d:string){if(!d)return"";const dt=new Date(d+"T00:00:00");return dt.toLocaleDateString("en-US",{weekday:"short",day:"numeric",month:"short",year:"numeric"});}
function uniqueCourseNames(courses:any[]){return[...new Set(courses.map(c=>c.course_name))];}
function teeBoxesForCourse(courses:any[],name:string){return courses.filter(c=>c.course_name===name);}

// ============================================================
// APP ROOT -- Supabase connected
// ============================================================
export default function App(){
  // -- state --------------------------------------------------
  const [golfers,setGolfers]=useState<any[]>([]);
  const [courses,setCourses]=useState<any[]>([]);
  const [events,setEvents]=useState<any[]>([]);
  const [signups,setSignups]=useState<any[]>([]);
  const [leaderboard,setLeaderboard]=useState<any[]>([]);
  const [holeScores,setHoleScores]=useState<any[]>([]);
  const [charityDonations,setCharityDonations]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [dbError,setDbError]=useState<string|null>(null);
  const [activeTab,setActiveTab]=useState("leaderboard");
  const [adminMode,setAdminMode]=useState(false);
  const [eventImages,setEventImages]=useState<any[]>([]);
  const [showPinModal,setShowPinModal]=useState(false);
  const [pinInput,setPinInput]=useState("");
  const [pinError,setPinError]=useState(false);
  const [pinShake,setPinShake]=useState(false);
  const [pinAttempts,setPinAttempts]=useState(0);
  const [successMsg,setSuccessMsg]=useState("");
  const [errorMsg,setErrorMsg]=useState("");

  // Lifted score-entry state -- survives tab navigation
  const [scoreMode,setScoreMode]=useState("hole");
  const [scoreEventId,setScoreEventId]=useState("");
  const [scorers,setScorers]=useState<any[]>([{golferId:"",courseId:"",totalPts:"",grossScores:Array(18).fill(""),submitted:false}]);

  const showSuccess=useCallback((msg:string)=>{setSuccessMsg(msg);setTimeout(()=>setSuccessMsg(""),3500);},[]);
  const showError=useCallback((msg:string)=>{setErrorMsg(msg);setTimeout(()=>setErrorMsg(""),5000);},[]);

  // -- initial load --------------------------------------------
  useEffect(()=>{
    const load=async()=>{
      try{
        setLoading(true);
        const [g,c,ev,su,lb,hs,cd]=await Promise.all([
          supabase.from("golfers").select(),
          supabase.from("courses").select(),
          supabase.from("events").select(),
          supabase.from("event_signups").select(),
          supabase.from("event_leaderboard").select(),
          supabase.from("hole_scores").select(),
          supabase.from("charity_donations").select(),
        ]);
        // Map DB column names -> app field names
        setGolfers(g.map((r:any)=>({...r,golfer_id:r.golfer_id})));
        setCourses(c.map((r:any)=>({...r,course_id:r.course_id})));
        setEvents(ev.map((r:any)=>({...r,event_id:r.event_id,tee_times:r.tee_times||[]})));
        setSignups(su.map((r:any)=>({...r,signup_id:r.signup_id})));
        setLeaderboard(lb.map((r:any)=>({...r,summary_id:r.summary_id})));
        setHoleScores(hs);
        setCharityDonations(cd);
        setDbError(null);
      }catch(e:any){
        setDbError(e.message||"Failed to connect to database");
      }finally{
        setLoading(false);
      }
    };
    load();
  },[]);

  // -- guest golfer listener -----------------------------------
  useEffect(()=>{const h=(e:any)=>setGolfers(p=>[...p,e.detail]);window.addEventListener("addGolfer",h);return()=>window.removeEventListener("addGolfer",h);},[]);
  // -- PWA / favicon icon injection ----------------------------
  useEffect(()=>{
    const iconDataUrl = "data:image/png;base64,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";

    // Favicon
    const existingFav = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    const fav: HTMLLinkElement = existingFav || document.createElement("link");
    fav.rel = "icon";
    fav.type = "image/png";
    fav.href = iconDataUrl;
    if (!existingFav) document.head.appendChild(fav);

    // Apple touch icon (iOS home screen)
    const existingApple = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement | null;
    const apple: HTMLLinkElement = existingApple || document.createElement("link");
    apple.rel = "apple-touch-icon";
    apple.href = iconDataUrl;
    if (!existingApple) document.head.appendChild(apple);

    // Shortcut icon (Android/PWA)
    const existingShortcut = document.querySelector("link[rel='shortcut icon']") as HTMLLinkElement | null;
    const shortcut: HTMLLinkElement = existingShortcut || document.createElement("link");
    shortcut.rel = "shortcut icon";
    shortcut.href = iconDataUrl;
    if (!existingShortcut) document.head.appendChild(shortcut);

    document.title = "Saturday School";
  },[]);


  // Load event images (scorecard photos)
  useEffect(()=>{
    supabase.from("event_images").select("*").then((rows:any)=>{
      if(rows)setEventImages(rows);
    }).catch(()=>{});
  },[]);

  // Auto-restore in-progress scoring session after data loads.
  // Runs once after loading completes.  Restores:
  //   - event selection + hole-by-hole mode
  //   - golfer + tee box (from signup.tee_box_course_id)
  //   - gross scores (from hole_scores rows already in DB)
  useEffect(()=>{
    if(loading||scoreEventId)return;
    const inProgress=events.find((e:any)=>e.status==="In-Progress");
    if(!inProgress)return;
    setScoreEventId(String(inProgress.event_id));
    setScoreMode("hole");
    // Collect all signups for this event that have a tee box assigned
    // (written by updateGross on first hole entered)
    // Any signup with a tee_box_course_id set means scoring started for that golfer
    const eventSignups=signups.filter((s:any)=>
      s.event_id===inProgress.event_id&&s.tee_box_course_id
    );
    if(!eventSignups.length)return;
    const restored=eventSignups.map((signup:any)=>{
      // Find the leaderboard entry to get the summary_id for hole score lookup
      const entry=leaderboard.find((r:any)=>
        r.event_id===inProgress.event_id&&r.golfer_id===signup.golfer_id
      );
      const gross=Array(18).fill("");
      if(entry){
        const hs=holeScores
          .filter((h:any)=>h.summary_id===entry.summary_id)
          .sort((a:any,b:any)=>a.hole_number-b.hole_number);
        hs.forEach((h:any)=>{gross[h.hole_number-1]=String(h.gross_score);});
      }
      return{
        golferId:String(signup.golfer_id),
        courseId:String(signup.tee_box_course_id),
        totalPts:"",
        grossScores:gross,
        submitted:false,
        started:true,   // already have a DB row, resume directly into scoring
        summaryId:entry?.summary_id||null
      };
    });
    if(restored.length)setScorers(restored);
  },[loading]);

  // -- DB write helpers ----------------------------------------
  // Each write: optimistically update local state, then sync to Supabase.
  // On error, revert and show message.

  const dbUpsertGolfer=useCallback(async(golfer:any)=>{
    const prev=golfers;
    const isNew=!golfer.golfer_id||golfer.golfer_id>1e12;// temp IDs from Date.now()
    try{
      if(isNew){
        const {golfer_id:_,...rest}=golfer;
        const [inserted]=await supabase.from("golfers").insert(rest);
        setGolfers(p=>p.map(g=>g.golfer_id===golfer.golfer_id?{...g,golfer_id:inserted.golfer_id}:g));
      }else{
        const {golfer_id,created_at,...rest}=golfer;
        await supabase.from("golfers").update(rest,{golfer_id});
      }
    }catch(e:any){setGolfers(prev);showError(`Save failed: ${e.message}`);}
  },[golfers,showError]);

  const dbDeleteGolfer=useCallback(async(golfer_id:number)=>{
    const prev=golfers;
    try{await supabase.from("golfers").delete({golfer_id});}
    catch(e:any){setGolfers(prev);showError(`Delete failed: ${e.message}`);}
  },[golfers,showError]);

  const dbUpsertCourse=useCallback(async(course:any)=>{
    const prev=courses;
    const isNew=!course.course_id||course.course_id>1e12;
    try{
      if(isNew){
        const {course_id:_,...rest}=course;
        const [inserted]=await supabase.from("courses").insert(rest);
        setCourses(p=>p.map(c=>c.course_id===course.course_id?{...c,course_id:inserted.course_id}:c));
      }else{
        const {course_id,created_at,...rest}=course;
        await supabase.from("courses").update(rest,{course_id});
      }
    }catch(e:any){setCourses(prev);showError(`Save failed: ${e.message}`);}
  },[courses,showError]);

  const dbDeleteCourse=useCallback(async(course_id:number)=>{
    const prev=courses;
    try{await supabase.from("courses").delete({course_id});}
    catch(e:any){setCourses(prev);showError(`Delete failed: ${e.message}`);}
  },[courses,showError]);

  const dbUpsertEvent=useCallback(async(event:any)=>{
    const prev=events;
    const isNew=!event.event_id||event.event_id>1e12;
    try{
      if(isNew){
        const {event_id:_,...rest}=event;
        const [inserted]=await supabase.from("events").insert(rest);
        setEvents(p=>p.map(e=>e.event_id===event.event_id?{...e,event_id:inserted.event_id}:e));
        return inserted.event_id;
      }else{
        const {event_id,created_at,...rest}=event;
        await supabase.from("events").update(rest,{event_id});
        return event_id;
      }
    }catch(e:any){setEvents(prev);showError(`Save failed: ${e.message}`);}
  },[events,showError]);

  const dbDeleteEvent=useCallback(async(event_id:number)=>{
    const prev=events; const prevSu=signups;
    try{await supabase.from("events").delete({event_id});}// cascade deletes signups
    catch(e:any){setEvents(prev);setSignups(prevSu);showError(`Delete failed: ${e.message}`);}
  },[events,signups,showError]);

  const dbUpsertSignup=useCallback(async(signup:any)=>{
    const prev=signups;
    try{
      const {signup_id,created_at,...rest}=signup;
      const isNew=!signup_id||signup_id>1e12;
      if(isNew){
        const [inserted]=await supabase.from("event_signups").insert(rest);
        setSignups(p=>p.map(s=>s.signup_id===signup.signup_id?{...s,signup_id:inserted.signup_id}:s));
      }else{
        await supabase.from("event_signups").update(rest,{signup_id});
      }
    }catch(e:any){setSignups(prev);showError(`RSVP save failed: ${e.message}`);}
  },[signups,showError]);

  const dbUpsertLeaderboard=useCallback(async(entry:any)=>{
    const prev=leaderboard;
    try{
      const isNew=!entry.summary_id||entry.summary_id>1e12;
      if(isNew){
        const {summary_id:_,...rest}=entry;
        const [inserted]=await supabase.from("event_leaderboard").insert(rest);
        setLeaderboard(p=>p.map(r=>r.summary_id===entry.summary_id?{...r,summary_id:inserted.summary_id}:r));
        return inserted.summary_id;
      }else{
        const {summary_id,created_at,...rest}=entry;
        await supabase.from("event_leaderboard").update(rest,{summary_id});
        return summary_id;
      }
    }catch(e:any){setLeaderboard(prev);showError(`Score save failed: ${e.message}`);}
  },[leaderboard,showError]);

  const dbDeleteLeaderboard=useCallback(async(summary_id:number)=>{
    const prev=leaderboard; const prevHs=holeScores;
    try{await supabase.from("event_leaderboard").delete({summary_id});}// cascade deletes hole_scores
    catch(e:any){setLeaderboard(prev);setHoleScores(prevHs);showError(`Delete failed: ${e.message}`);}
  },[leaderboard,holeScores,showError]);

  const dbInsertHoleScores=useCallback(async(scores:any[])=>{
    try{await supabase.from("hole_scores").insert(scores);}
    catch(e:any){showError(`Hole scores save failed: ${e.message}`);}
  },[showError]);

  // Per-hole upsert used during live entry -- on_conflict(summary_id,hole_number)
  // means re-entering the same hole just updates it, no duplicate rows ever created.
  const dbUpsertHoleScore=useCallback(async(row:any)=>{
    try{
      const {score_id:_,...payload}=row; // strip client-side temp id
      await supabase.from("hole_scores").upsert(payload,"summary_id,hole_number");
    }
    catch(e:any){showError(`Live hole save failed: ${e.message}`);}
  },[showError]);

  const dbDeleteHoleScores=useCallback(async(summary_id:number)=>{
    try{await supabase.from("hole_scores").delete({summary_id});}
    catch(e:any){showError(`Delete failed: ${e.message}`);}
  },[showError]);

  const dbUpsertCharity=useCallback(async(donation:any)=>{
    const prev=charityDonations;
    try{
      const {id:_,...rest}=donation;
      const [inserted]=await supabase.from("charity_donations").insert(rest);
      setCharityDonations(p=>p.map(d=>d.id===donation.id?{...d,id:inserted.id}:d));
    }catch(e:any){setCharityDonations(prev);showError(`Save failed: ${e.message}`);}
  },[charityDonations,showError]);

  // -- wrapped setters that also write to DB ------------------
  // These are passed to child components exactly like the old setState functions
  // but they also trigger a DB sync.

  const setGolfersDB=useCallback((updater:any)=>{
    setGolfers(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      // Diff: find added or changed golfer and upsert
      const changed=next.filter((n:any)=>{
        const old=prev.find((o:any)=>o.golfer_id===n.golfer_id);
        return !old||JSON.stringify(old)!==JSON.stringify(n);
      });
      const removed=prev.filter((o:any)=>!next.find((n:any)=>n.golfer_id===o.golfer_id));
      changed.forEach((g:any)=>dbUpsertGolfer(g));
      removed.forEach((g:any)=>{ if(g.golfer_id&&g.golfer_id<1e12) dbDeleteGolfer(g.golfer_id); });
      return next;
    });
  },[dbUpsertGolfer,dbDeleteGolfer]);

  const setCoursesDB=useCallback((updater:any)=>{
    setCourses(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      const changed=next.filter((n:any)=>{
        const old=prev.find((o:any)=>o.course_id===n.course_id);
        return !old||JSON.stringify(old)!==JSON.stringify(n);
      });
      const removed=prev.filter((o:any)=>!next.find((n:any)=>n.course_id===o.course_id));
      changed.forEach((c:any)=>dbUpsertCourse(c));
      removed.forEach((c:any)=>{ if(c.course_id&&c.course_id<1e12) dbDeleteCourse(c.course_id); });
      return next;
    });
  },[dbUpsertCourse,dbDeleteCourse]);

  // Ref to track event inserts in-flight -- prevents double-insert from
  // React Strict Mode double-invoking updaters.
  const pendingEventInsert=useRef<Set<number>>(new Set());

  const setEventsDB=useCallback((updater:any)=>{
    // Compute next state without triggering any DB writes inside setState
    setEvents(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      const changed=next.filter((n:any)=>{
        const old=prev.find((o:any)=>o.event_id===n.event_id);
        return !old||JSON.stringify(old)!==JSON.stringify(n);
      });
      const removed=prev.filter((o:any)=>!next.find((n:any)=>n.event_id===o.event_id));

      // Schedule DB writes OUTSIDE the updater using setTimeout(0)
      // so they run after state has settled and are never double-called.
      changed.forEach((e:any)=>{
        const isNew=!e.event_id||e.event_id>1e12;
        if(isNew){
          const tempId=e.event_id;
          if(pendingEventInsert.current.has(tempId))return; // already inserting
          pendingEventInsert.current.add(tempId);
          setTimeout(async()=>{
            try{
              const realId=await dbUpsertEvent(e);
              if(realId&&realId!==tempId){
                setEvents(p=>p.map(ev=>ev.event_id===tempId?{...ev,event_id:realId}:ev));
                // Get current signups snapshot and insert with real event_id
                setSignups(su=>{
                  const toInsert=su.filter((s:any)=>s.event_id===tempId);
                  const patched=su.map((s:any)=>s.event_id===tempId?{...s,event_id:realId}:s);
                  // Use upsert with on_conflict so duplicate-key errors can't occur
                  toInsert.forEach((s:any)=>{
                    const {signup_id:_,...rest}={...s,event_id:realId};
                    supabase.from("event_signups")
                      .upsert({...rest,event_id:realId},"event_id,golfer_id")
                      .catch(()=>{});
                  });
                  return patched; // state is correct immediately — no refresh needed
                });
              }
            } finally {
              pendingEventInsert.current.delete(tempId);
            }
          },0);
        }else{
          setTimeout(()=>dbUpsertEvent(e),0);
        }
      });

      removed.forEach((e:any)=>{
        if(e.event_id&&e.event_id<1e12) setTimeout(()=>dbDeleteEvent(e.event_id),0);
      });
      return next;
    });
  },[dbUpsertEvent,dbDeleteEvent,dbUpsertSignup]);

  const setSignupsDB=useCallback((updater:any)=>{
    setSignups(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      const changed=next.filter((n:any)=>{
        const old=prev.find((o:any)=>o.signup_id===n.signup_id);
        return !old||JSON.stringify(old)!==JSON.stringify(n);
      });
      // Don't sync signups whose event_id is still a temp value -- they'll be
      // patched to the real event_id by setEventsDB and re-synced then
      changed.filter((s:any)=>!(s.event_id>1e12)).forEach((s:any)=>dbUpsertSignup(s));
      return next;
    });
  },[dbUpsertSignup]);

  const setLeaderboardDB=useCallback((updater:any)=>{
    setLeaderboard(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      const changed=next.filter((n:any)=>{
        const old=prev.find((o:any)=>o.summary_id===n.summary_id);
        return !old||JSON.stringify(old)!==JSON.stringify(n);
      });
      const removed=prev.filter((o:any)=>!next.find((n:any)=>n.summary_id===o.summary_id));
      changed.forEach((r:any)=>dbUpsertLeaderboard(r));
      removed.forEach((r:any)=>{ if(r.summary_id&&r.summary_id<1e12) dbDeleteLeaderboard(r.summary_id); });
      return next;
    });
  },[dbUpsertLeaderboard,dbDeleteLeaderboard]);

  const setHoleScoresDB=useCallback((updater:any)=>{
    setHoleScores(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      // Only insert new scores (hole scores are append-only from score entry)
      const added=next.filter((n:any)=>!prev.find((o:any)=>o.score_id===n.score_id));
      if(added.length>0) dbInsertHoleScores(added.map(({score_id:_,...r}:any)=>r));
      return next;
    });
  },[dbInsertHoleScores]);

  const setCharityDB=useCallback((updater:any)=>{
    setCharityDonations(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      const added=next.filter((n:any)=>!prev.find((o:any)=>o.id===n.id));
      added.forEach((d:any)=>dbUpsertCharity(d));
      return next;
    });
  },[dbUpsertCharity]);

  // -- loading / error screens ---------------------------------
  const tabs=adminMode
    ?[{id:"leaderboard",label:"Leaderboard"},{id:"rsvp",label:"Sign Up"},{id:"score",label:"Scoring"},{id:"admin",label:"⚙ Admin"},{id:"analytics",label:"Analytics"}]
    :[{id:"leaderboard",label:"Leaderboard"},{id:"rsvp",label:"Sign Up"},{id:"score",label:"Scoring"},{id:"analytics",label:"Analytics"}];

  if(loading) return(
    <>
      <style>{CSS}</style>
      <div className="app-shell" style={{justifyContent:"center",alignItems:"center",gap:16}}>
        <div style={{fontFamily:"DM Serif Display,serif",fontSize:28,color:"var(--green-800)"}}>Saturday School</div>
        <div style={{fontSize:15,color:"var(--text-muted)"}}>Loading league data…</div>
        <div style={{width:40,height:40,border:"4px solid var(--green-100)",borderTop:"4px solid var(--green-700)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  );

  if(dbError) return(
    <>
      <style>{CSS}</style>
      <div className="app-shell" style={{justifyContent:"center",alignItems:"center",gap:12,padding:24}}>
        <div style={{fontFamily:"DM Serif Display,serif",fontSize:26,color:"var(--green-800)"}}>Saturday School</div>
        <div style={{background:"var(--red-100)",border:"1px solid var(--red-400)",borderRadius:"var(--radius-md)",padding:"16px 20px",textAlign:"center",maxWidth:380}}>
          <div style={{fontWeight:700,color:"var(--red-600)",marginBottom:8}}>Database Connection Error</div>
          <div style={{fontSize:14,color:"var(--text-secondary)",marginBottom:12}}>{dbError}</div>
          <div style={{fontSize:13,color:"var(--text-muted)"}}>Check your Supabase URL and anon key in App.tsx, then refresh the page.</div>
        </div>
        <button className="btn btn-outline" onClick={()=>window.location.reload()}>Retry</button>
      </div>
    </>
  );

  return(
    <>
      <style>{CSS}</style>
      <div className="app-shell">
        <header className="app-header">
          <div className="header-top">
            <div><div className="brand-name">Saturday School</div><div className="brand-tagline">Stableford Golf League</div></div>
            <button
              className="header-badge"
              style={{background:adminMode?"#c02020":undefined}}
              onClick={()=>{
                if(adminMode){
                  setAdminMode(false);
                  sessionStorage.removeItem("ss_admin");
                } else {
                  if(sessionStorage.getItem("ss_admin")==="1"){
                    setAdminMode(true);
                  } else {
                    setPinInput("");setPinError(false);setPinShake(false);
                    setShowPinModal(true);
                  }
                }
              }}
            >{adminMode?"Exit Admin":"Admin"}</button>
          </div>
          <nav className="nav-tabs">{tabs.map(t=><button key={t.id} className={`nav-tab${activeTab===t.id?" active":""}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>)}</nav>
        </header>
        <main className="main-content">
          {successMsg&&<div className="success-banner"><span>✓</span>{successMsg}</div>}
          {errorMsg&&<div style={{background:"var(--red-100)",border:"1px solid var(--red-400)",borderRadius:"var(--radius-md)",padding:"12px 16px",color:"var(--red-600)",fontSize:14,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span>⚠</span>{errorMsg}</div>}
          {activeTab==="leaderboard"&&<LeaderboardTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} holeScores={holeScores} signups={signups} adminMode={adminMode} eventImages={eventImages} setEventImages={setEventImages} showSuccess={showSuccess}/>}
          {activeTab==="rsvp"&&<RSVPTab golfers={golfers} courses={courses} events={events} setEvents={setEventsDB} signups={signups} setSignups={setSignupsDB} showSuccess={showSuccess} adminMode={adminMode}/>}
          {activeTab==="score"&&<ScoreEntryTab golfers={golfers} courses={courses} events={events} signups={signups} setSignups={setSignupsDB} leaderboard={leaderboard} setLeaderboard={setLeaderboardDB} holeScores={holeScores} setHoleScores={setHoleScoresDB} setEvents={setEventsDB} dbUpsertHoleScore={dbUpsertHoleScore} scoreMode={scoreMode} setScoreMode={setScoreMode} scoreEventId={scoreEventId} setScoreEventId={setScoreEventId} scorers={scorers} setScorers={setScorers} showSuccess={showSuccess}/>}
          {activeTab==="admin"&&adminMode&&<AdminTab golfers={golfers} setGolfers={setGolfersDB} courses={courses} setCourses={setCoursesDB} events={events} setEvents={setEventsDB} signups={signups} setSignups={setSignupsDB} leaderboard={leaderboard} setLeaderboard={setLeaderboardDB} holeScores={holeScores} setHoleScores={setHoleScoresDB} charityDonations={charityDonations} setCharityDonations={setCharityDB} showSuccess={showSuccess}/>}
          {activeTab==="analytics"&&<AnalyticsTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} signups={signups} holeScores={holeScores}/>}
        </main>

        {/* PIN Modal */}
        {showPinModal&&(()=>{
          const PINS=((typeof import.meta!=="undefined"&&(import.meta as any).env?.VITE_ADMIN_PINS)||"").toString().split(",").map((p:string)=>p.trim()).filter(Boolean);
          const pinLen=(PINS[0]||"000000").length;
          const digits=pinInput.length;
          const handleDigit=(d:string)=>{
            if(pinInput.length>=pinLen)return;
            const next=pinInput+d;
            setPinInput(next);
            if(next.length===pinLen){
              if(PINS.includes(next)){
                setAdminMode(true);
                setActiveTab("admin");
                sessionStorage.setItem("ss_admin","1");
                setShowPinModal(false);
                setPinInput("");
                setPinAttempts(0);
                setPinError(false);
              } else {
                const att=pinAttempts+1;
                setPinAttempts(att);
                setPinError(true);
                setPinShake(true);
                setTimeout(()=>{setPinInput("");setPinShake(false);},500);
              }
            }
          };
          const handleBack=()=>{if(pinInput.length>0){setPinInput(p=>p.slice(0,-1));setPinError(false);}};
          return(
            <div
              style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
              onClick={()=>{setShowPinModal(false);setPinInput("");setPinError(false);}}
            >
              <div
                style={{background:"var(--surface)",borderRadius:"var(--radius-lg) var(--radius-lg) 0 0",padding:"28px 24px 40px",width:"100%",maxWidth:360}}
                onClick={(e:any)=>e.stopPropagation()}
              >
                <div style={{textAlign:"center",marginBottom:22}}>
                  <div style={{fontSize:18,fontWeight:700,color:"var(--green-800)",marginBottom:4}}>Admin Access</div>
                  <div style={{fontSize:13,color:"var(--text-muted)"}}>Enter your PIN to continue</div>
                </div>

                {/* PIN dots */}
                <div style={{
                  display:"flex",justifyContent:"center",gap:14,marginBottom:16,
                  animation:pinShake?"pinShake 0.4s ease":undefined
                }}>
                  {Array.from({length:pinLen},(_,i)=>(
                    <div key={i} className={"pin-dot"+(i<digits?" filled":"")}/>
                  ))}
                </div>

                {pinError&&(
                  <div style={{textAlign:"center",fontSize:13,color:"var(--red-600)",fontWeight:600,marginBottom:10}}>
                    Incorrect PIN{pinAttempts>1?" ("+pinAttempts+" attempts)":""}
                  </div>
                )}

                {/* Numpad */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                  {["1","2","3","4","5","6","7","8","9","","0","back"].map((d,i)=>(
                    <button
                      key={i}
                      onClick={()=>d==="back"?handleBack():d?handleDigit(d):undefined}
                      style={{
                        padding:"16px 0",
                        fontSize:d==="back"?20:22,
                        fontWeight:600,
                        borderRadius:"var(--radius-md)",
                        border:"1px solid var(--border)",
                        background:d==="back"?"var(--surface2)":d===""?"transparent":"var(--surface)",
                        color:d==="back"?"var(--text-muted)":"var(--text-primary)",
                        cursor:d?"pointer":"default",
                        visibility:d===""?"hidden":"visible",
                        boxShadow:d&&d!=="back"?"var(--shadow-sm)":"none",
                      }}
                    >{d==="back"?"⌫":d}</button>
                  ))}
                </div>

                <button
                  className="btn btn-outline btn-full"
                  style={{fontSize:15}}
                  onClick={()=>{setShowPinModal(false);setPinInput("");setPinError(false);}}
                >Cancel</button>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}

// ============================================================
// HELPERS - season data builder
// All rounds now come from Supabase via the leaderboard state.
// EXTRA_ROUNDS_BY_GOLFER is no longer needed.
// ============================================================
function buildSeasonRounds(golfers:any[],leaderboard:any[],season:number){
  const byG:Record<number,{pts:number,eid:number,sid:number}[]>={};
  leaderboard.forEach((r:any)=>{
    if(r.season!==season)return;
    const g=golfers.find((x:any)=>x.golfer_id===r.golfer_id);
    if(!g||g.is_guest)return;
    if(!byG[r.golfer_id])byG[r.golfer_id]=[];
    // Deduplicate: one entry per event per golfer (keep highest score if dupes exist)
    const existing=byG[r.golfer_id].find((x:any)=>x.eid===r.event_id);
    if(existing){
      if(r.total_stableford_points>existing.pts){existing.pts=r.total_stableford_points;existing.sid=r.summary_id;}
    } else {
      byG[r.golfer_id].push({pts:r.total_stableford_points,eid:r.event_id,sid:r.summary_id});
    }
  });
  // Return as simple number arrays for backward compat
  const result:Record<number,number[]>={};
  Object.entries(byG).forEach(([gid,arr])=>{result[parseInt(gid)]=arr.map((x:any)=>x.pts);});
  return result;
}

function golferStats(golfers:any[],leaderboard:any[],gid:number,season:number){
  // Deduplicate: one entry per event per golfer (keep highest score to match buildSeasonRounds)
  const rawEntries=leaderboard.filter((r:any)=>r.golfer_id===gid&&r.season===season);
  const deduped:any[]=[]; 
  rawEntries.forEach((r:any)=>{
    const ex=deduped.find((x:any)=>x.event_id===r.event_id);
    if(ex){if(r.total_stableford_points>ex.total_stableford_points)Object.assign(ex,r);}
    else deduped.push({...r});
  });
  const entries=deduped;
  const allPts=entries.map((r:any)=>r.total_stableford_points);
  // Derive wins/seconds and stableford earnings from score rankings.
  // Payout rules:
  //   - Solo 1st: 2/3 of pot to winner, 1/3 to 2nd place
  //   - Tied 1st: entire pot split evenly among all tied leaders, no 2nd payout
  let wins=0, seconds=0, stablefordEarned=0;
  const eventIds=[...new Set(entries.map((r:any)=>r.event_id))];
  eventIds.forEach((eid:any)=>{
    const evEntries=[...leaderboard.filter((x:any)=>x.event_id===eid&&x.buy_in_paid)]
      .sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
    if(!evEntries.length)return;
    const pot=evEntries.length*20;
    const topPts=evEntries[0].total_stableford_points;
    const tied1st=evEntries.filter((e:any)=>e.total_stableford_points===topPts);
    // Only award 2nd place when there is exactly ONE player in 1st
    const secondPts=tied1st.length===1&&evEntries.length>1?evEntries[1]?.total_stableford_points:null;
    const tied2nd=secondPts!=null?evEntries.filter((e:any)=>e.total_stableford_points===secondPts):[];
    if(tied1st.some((e:any)=>e.golfer_id===gid)){
      wins++;
      if(tied1st.length===1){
        // Solo winner gets 2/3
        stablefordEarned+=pot*(2/3);
      } else {
        // Tied 1st: split entire pot
        stablefordEarned+=pot/tied1st.length;
      }
    } else if(tied2nd.some((e:any)=>e.golfer_id===gid)){
      seconds++;
      // 2nd place only exists when there's a solo 1st; they get 1/3
      stablefordEarned+=(pot*(1/3))/tied2nd.length;
    }
  });
  const netEarnings=stablefordEarned-(allPts.length*20);
  return{rounds:allPts.length,avg:allPts.length?allPts.reduce((a,b)=>a+b,0)/allPts.length:0,best:allPts.length?Math.max(...allPts):0,worst:allPts.length?Math.min(...allPts):0,wins,seconds,stablefordEarned,netEarnings};
}

// ============================================================
// LEADERBOARD TAB
// ============================================================
function LeaderboardTab({golfers,courses,events,leaderboard,holeScores,signups,adminMode,eventImages,setEventImages,showSuccess}:any){
  const [subTab,setSubTab]=useState("season");
  const [selEventId,setSelEventId]=useState<number|null>(null);
  const [expandedId,setExpandedId]=useState<number|null>(null);
  const [showScorecardModal,setShowScorecardModal]=useState(false);
  const [scorecardUploading,setScorecardUploading]=useState(false);
  const [lightboxImg,setLightboxImg]=useState<string|null>(null);
  const [liveExpandedId,setLiveExpandedId]=useState<number|null>(null);

  // 1) Season selector -- dropdown only, no "all time"
  const allSeasons=[...new Set([...events.map((e:any)=>e.season),...leaderboard.map((r:any)=>r.season)])].sort((a:any,b:any)=>b-a) as number[];
  const [selSeason,setSelSeason]=useState<number>(allSeasons[0]||2026);

  const completedEvents=[...events].filter((e:any)=>e.status==="Completed").sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const seasonEvents=completedEvents.filter((e:any)=>e.season===selSeason);
  const displayEvent=selEventId?completedEvents.find((e:any)=>e.event_id===selEventId):seasonEvents[0];

  const eventEntries=displayEvent
    ?[...leaderboard.filter((e:any)=>e.event_id===displayEvent.event_id)].sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points)
    :[];

  const paidEntries=[...eventEntries.filter((e:any)=>e.buy_in_paid)].sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
  const totalPot=paidEntries.length*20;
  const first1stPts=paidEntries[0]?.total_stableford_points;
  const tied1st=paidEntries.filter((e:any)=>e.total_stableford_points===first1stPts);

  // Check if skins are calculable for this event (all H-H)
  const skinsEligible=eventEntries.length>0&&eventEntries.every((e:any)=>e.entry_type==="Hole-by-Hole");

  // Live skins calculation: a skin is won when one player has the lowest net score on a hole outright
  const calcLiveSkins:(()=>Record<number,number>)=()=>{
    if(!skinsEligible||!displayEvent)return{};
    const skinsPaid=eventEntries.filter((e:any)=>e.skins_paid);
    if(!skinsPaid.length)return{};
    const skinPot=skinsPaid.length*10;
    // Build per-hole net scores for all players
    const playerHoles:Record<number,{net:number,gross:number}[]>={};
    skinsPaid.forEach((entry:any)=>{
      const hs=holeScores.filter((h:any)=>h.summary_id===entry.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number);
      if(hs.length<18)return; // not complete
      playerHoles[entry.golfer_id]=hs.map((h:any)=>({net:h.net_score??h.gross_score,gross:h.gross_score}));
    });
    const playerIds=Object.keys(playerHoles).map(Number);
    if(playerIds.length<2)return{};
    // For each hole, find lowest net, see if only one player has it
    const skinWins:Record<number,number>={};
    for(let h=0;h<18;h++){
      const nets=playerIds.map(id=>({id,net:playerHoles[id][h]?.net})).filter(x=>x.net!=null);
      if(!nets.length)continue;
      const minNet=Math.min(...nets.map(x=>x.net));
      const winners=nets.filter(x=>x.net===minNet);
      if(winners.length===1){
        skinWins[winners[0].id]=(skinWins[winners[0].id]||0)+1;
      }
    }
    const totalSkins=Object.values(skinWins).reduce((s,n)=>s+n,0);
    if(!totalSkins)return{};
    const perSkin=skinPot/totalSkins;
    const skinPayouts:Record<number,number>={};
    Object.entries(skinWins).forEach(([gid,wins])=>{skinPayouts[parseInt(gid)]=wins*perSkin;});
    return skinPayouts;
  };
  const liveSkinPayouts=calcLiveSkins();
  const hasLiveSkins=Object.keys(liveSkinPayouts).length>0;

  // Per-hole skin winner map: hole_number (1-based) -> winning golfer_id
  // Used to highlight skin-winning holes on the scorecard
  const calcSkinHoleWinners:(()=>Record<number,number>)=()=>{
    if(!skinsEligible||!displayEvent)return{};
    const skinsPaid=eventEntries.filter((e:any)=>e.skins_paid);
    if(!skinsPaid.length)return{};
    const playerHoles:Record<number,{net:number}[]>={};
    skinsPaid.forEach((entry:any)=>{
      const hs=holeScores.filter((h:any)=>h.summary_id===entry.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number);
      if(hs.length<18)return;
      playerHoles[entry.golfer_id]=hs.map((h:any)=>({net:h.net_score??h.gross_score}));
    });
    const playerIds=Object.keys(playerHoles).map(Number);
    if(playerIds.length<2)return{};
    const holeWinners:Record<number,number>={};
    for(let h=0;h<18;h++){
      const nets=playerIds.map(id=>({id,net:playerHoles[id][h]?.net})).filter(x=>x.net!=null);
      if(!nets.length)continue;
      const minNet=Math.min(...nets.map(x=>x.net));
      const winners=nets.filter(x=>x.net===minNet);
      if(winners.length===1) holeWinners[h+1]=winners[0].id; // 1-based hole number
    }
    return holeWinners;
  };
  const skinHoleWinners=calcSkinHoleWinners();

  // 1a) Show ALL golfers -- exclude In-Progress rounds, flag <15 as unqualified
  const completedEventIds=new Set(events.filter((e:any)=>e.status==="Completed").map((e:any)=>e.event_id));
  const leaderboardCompleted=leaderboard.filter((r:any)=>completedEventIds.has(r.event_id));
  const byG=buildSeasonRounds(golfers,leaderboardCompleted,selSeason);
  const seasonAvg=Object.entries(byG)
    .map(([gid,r])=>({golfer_id:parseInt(gid),avg:r.reduce((a,b)=>a+b,0)/r.length,rounds:r.length,qualified:r.length>=15}))
    .sort((a,b)=>b.avg-a.avg);

  const top15Avg=Object.entries(byG)
    .map(([gid,r])=>{const top=[...r].sort((a,b)=>b-a).slice(0,15);return{golfer_id:parseInt(gid),avg:top.reduce((a,b)=>a+b,0)/top.length,rounds:r.length,qualified:r.length>=15};})
    .sort((a,b)=>b.avg-a.avg);

  // Live event: any event currently In-Progress
  const liveEvent=events.find((e:any)=>e.status==="In-Progress");

  // Auto-switch to LIVE tab when an in-progress event appears
  useEffect(()=>{
    if(liveEvent&&subTab!=="live") setSubTab("live");
  },[liveEvent?.event_id]);

  const tabs=[
    ...(liveEvent?[{id:"live",label:"live"}]:[]),
    {id:"season",label:"Season Avg"},
    {id:"top15",label:"Top 15 Avg"},
    {id:"weekly",label:"Weekly"},
  ];

  // Helper: assign tie positions to a sorted array
  // Both players in a tie get marked tied:true so they both show "T1", "T2", etc.
  const withTiePositions=(arr:any[],scoreKey:string)=>{
    let currentPos=1;
    // First pass: assign positions and detect ties
    const withPos=arr.map((row,i)=>{
      if(i>0&&arr[i][scoreKey]===arr[i-1][scoreKey]){
        return{...row,pos:currentPos,tied:true};
      }
      currentPos=i+1;
      return{...row,pos:currentPos,tied:false};
    });
    // Second pass: if any row with a given pos has tied:true, mark ALL rows at that pos as tied
    const tiedPositions=new Set(withPos.filter((r:any)=>r.tied).map((r:any)=>r.pos));
    return withPos.map((r:any)=>tiedPositions.has(r.pos)?{...r,tied:true}:r);
  };

  const seasonAvgWithTies=withTiePositions(seasonAvg,"avg");
  const top15AvgWithTies=withTiePositions(top15Avg,"avg");
  const eventEntriesWithTies=withTiePositions(eventEntries,"total_stableford_points");

  // Scorecard golf symbol
  const ScoreSymbol=({gross,par}:{gross:number,par:number})=>{
    const diff=gross-par;
    let cls="sc-par";
    if(diff<=-2)cls="sc-eagle";
    else if(diff===-1)cls="sc-birdie";
    else if(diff===1)cls="sc-bogey";
    else if(diff===2)cls="sc-dbl";
    else if(diff>=3)cls="sc-triple";
    return <span className={`sc-score ${cls}`}>{gross}</span>;
  };

  // Render ESPN-style leaderboard row
  const renderLbRow=(row:any,mode:"season"|"weekly")=>{
    const gid=row.golfer_id;
    const g=golfers.find((x:any)=>x.golfer_id===gid);
    const isExpanded=expandedId===gid;
    const stats=golferStats(golfers,leaderboardCompleted,gid,selSeason);
    // 4: tie display
    const posLabel=row.tied?`T${row.pos}`:String(row.pos);
    const rankClass=row.pos===1?"r1":row.pos===2?"r2":row.pos===3?"r3":"";

    const weeklyEntry=mode==="weekly"?leaderboard.find((r:any)=>r.event_id===displayEvent?.event_id&&r.golfer_id===gid):null;
    const hbhScores=weeklyEntry?.entry_type==="Hole-by-Hole"
      ?holeScores.filter((hs:any)=>hs.summary_id===weeklyEntry.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number)
      :[];
    const signup=displayEvent?signups.find((s:any)=>s.event_id===displayEvent.event_id&&s.golfer_id===gid):null;
    const teePlayed=signup?.tee_box_course_id?courses.find((c:any)=>c.course_id===signup.tee_box_course_id):null;
    // Derive weekly earnings from score rankings (stored fields are often 0)
    const weeklyEarned=(()=>{
      if(!weeklyEntry||!weeklyEntry.buy_in_paid)return 0;
      const paidEv=eventEntries.filter((e:any)=>e.buy_in_paid).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
      if(!paidEv.length)return 0;
      const pot=paidEv.length*20;
      const topPts=paidEv[0].total_stableford_points;
      const tied1stEv=paidEv.filter((e:any)=>e.total_stableford_points===topPts);
      const secondPts=tied1stEv.length===1&&paidEv.length>1?paidEv[1]?.total_stableford_points:null;
      const tied2ndEv=secondPts!=null?paidEv.filter((e:any)=>e.total_stableford_points===secondPts):[];
      let earned=0;
      if(tied1stEv.some((e:any)=>e.golfer_id===gid)){
        earned=tied1stEv.length===1?pot*(2/3):pot/tied1stEv.length;
      } else if(tied2ndEv.some((e:any)=>e.golfer_id===gid)){
        earned=(pot*(1/3))/tied2ndEv.length;
      }
      // Use live skins calculation if available, else fall back to stored field
      earned+=hasLiveSkins?(liveSkinPayouts[gid]||0):Number(weeklyEntry.skins_payout_won||0);
      return earned;
    })();

    return(
      <div key={gid}>
        <div className={`lb-row${isExpanded?" expanded":""}`} onClick={()=>setExpandedId(isExpanded?null:gid)}>
          <div className={`lb-rank-cell ${rankClass}`} style={{fontSize:row.tied?16:22,fontWeight:700}}>{posLabel}</div>
          <div className="lb-name-cell">
            <div className="lb-name-main">{(()=>{
              if(!g)return"Unknown";
              // Easter egg: Errol Kaplan wins the weekly event -> "Happy Kappy -" when expanded
              const isErrol=g.first_name==="Errol"&&g.last_name==="Kaplan";
              const topGidPaid=paidEntries[0]?.golfer_id;
              const topPtsPaid=paidEntries[0]?.total_stableford_points;
              const errolSoloWin=mode==="weekly"&&paidEntries.length>0&&topGidPaid===gid
                &&(paidEntries.length===1||paidEntries[1].total_stableford_points<topPtsPaid);
              if(isErrol&&errolSoloWin&&isExpanded)return"Happy Kappy 😊";
              return g.first_name+" "+g.last_name;
            })()}</div>
          </div>
          <div className="lb-score-cell">
            {/* 4b: 2 decimal places on season avg */}
            <div className="lb-score-big">{mode==="season"?(row.avg as number).toFixed(2):mode==="weekly"?(row as any).total_stableford_points:""}</div>
          </div>
          <div className="lb-thru-cell">
            {mode==="season"
              ?<div className="lb-thru-big">{row.rounds}{!row.qualified?"*":""}</div>
              :<div className="lb-thru-big" style={{color:weeklyEarned>0?"var(--gold-600)":"var(--text-muted)",fontSize:15}}>{weeklyEarned>0?`$${weeklyEarned.toFixed(0)}`:"--"}</div>
            }
          </div>
        </div>
        {isExpanded&&(
          <div className="lb-detail">
            {mode==="season"?(
              <div className="lb-detail-grid">
                <div className="lb-detail-item"><div className="lb-detail-key">HCP Index</div><div className="lb-detail-val">{g?.current_handicap_index?.toFixed(1)}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">Rounds</div><div className="lb-detail-val">{stats.rounds}{!row.qualified?"*":""}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">1st Place Wins</div><div className="lb-detail-val">{stats.wins}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">2nd Place</div><div className="lb-detail-val">{stats.seconds}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">Best Round</div><div className="lb-detail-val" style={{color:"var(--gold-600)"}}>{stats.best}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">Worst Round</div><div className="lb-detail-val" style={{color:"var(--red-600)"}}>{stats.worst}</div></div>
                <div className="lb-detail-item" style={{gridColumn:"1/-1"}}>
                  <div className="lb-detail-key">Net Earnings (stableford − entry fees)</div>
                  <div className="lb-detail-val" style={{color:stats.netEarnings>=0?"var(--green-700)":"var(--red-600)",fontSize:22}}>
                    {stats.netEarnings>=0?"+$"+stats.netEarnings.toFixed(0):"-$"+Math.abs(stats.netEarnings).toFixed(0)}
                  </div>
                </div>
              </div>
            ):(()=>{
              // 5: weekly detail with total score + proper scorecard
              const course=teePlayed||courses.find((c:any)=>c.course_name===displayEvent?.course_name);
              const front9=hbhScores.slice(0,9);
              const back9=hbhScores.slice(9,18);
              const front9Gross=front9.reduce((s:number,h:any)=>s+(h.gross_score||0),0);
              const back9Gross=back9.reduce((s:number,h:any)=>s+(h.gross_score||0),0);
              const front9Pts=front9.reduce((s:number,h:any)=>s+(h.stableford_points||0),0);
              const back9Pts=back9.reduce((s:number,h:any)=>s+(h.stableford_points||0),0);
              return(
                <>
                  {/* Weekly metrics: Total Score, HCP, Tees, Earnings */}
                  <div className="lb-detail-grid" style={{marginBottom:10}}>
                    
                    {/* 3: Total Gross only shown when H×H data exists */}
                    
                    <div className="lb-detail-item"><div className="lb-detail-key">Playing HCP</div><div className="lb-detail-val">{signup?.playing_handicap!=null?signup.playing_handicap:(g&&teePlayed?calcPlayingHandicap(g.current_handicap_index,teePlayed.tee_slope,teePlayed.tee_rating,teePlayed.par):"--")}</div></div>
                    <div className="lb-detail-item"><div className="lb-detail-key">Tees Played</div><div className="lb-detail-val">{teePlayed?.tee_box_name??"--"}</div></div>
                    {hbhScores.length>0&&<div className="lb-detail-item"><div className="lb-detail-key">Total Gross</div><div className="lb-detail-val" style={{fontWeight:700,fontSize:22}}>{front9Gross+back9Gross}</div></div>}
                    {/* 3: Show stableford and skins winnings as separate lines */}
                    {weeklyEntry?.weekly_payout_won>0&&<div className="lb-detail-item"><div className="lb-detail-key">Stableford Won</div><div className="lb-detail-val" style={{color:"var(--gold-600)",fontWeight:700}}>${Number(weeklyEntry.weekly_payout_won).toFixed(0)}</div></div>}
                    {(()=>{
                      const skinAmt=hasLiveSkins?(liveSkinPayouts[gid]||0):Number(weeklyEntry?.skins_payout_won||0);
                      return skinAmt>0?<div className="lb-detail-item"><div className="lb-detail-key">Skins Won</div><div className="lb-detail-val" style={{color:"var(--green-700)",fontWeight:700}}>${skinAmt.toFixed(0)}</div></div>:null;
                    })()}
                  </div>

                  {/* 5: Full golf scorecard table */}
                  {hbhScores.length>0&&course&&(()=>{
                    const renderHalf=(holes:any[],startIdx:number,outIn:string,grossTotal:number,ptsTotal:number)=>(
                      <div className="scorecard-wrap">
                        <table className="scorecard-table">
                          <thead>
                            <tr>
                              <th className="label-col">Hole</th>
                              {holes.map((_:any,i:number)=>{
                                const hNum=startIdx+i+1;
                                const wonSkin=skinHoleWinners[hNum]===gid;
                                return<th key={i} style={wonSkin?{background:"var(--gold-100,#fef3cd)",color:"var(--gold-700)"}:{}}>{hNum}{wonSkin?" 💰":""}</th>;
                              })}
                              <th className="total-col">{outIn}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="label-col">Par</td>
                              {holes.map((h:any,i:number)=>{
                                const hNum=startIdx+i+1;
                                const wonSkin=skinHoleWinners[hNum]===gid;
                                return<td key={i} style={{color:"var(--text-muted)",fontSize:11,...(wonSkin?{background:"var(--gold-50,#fffbeb)"}:{})}}>{course?.hole_pars?.[startIdx+i]??""}</td>;
                              })}
                              <td className="total-col">{course?.hole_pars?.slice(startIdx,startIdx+9).reduce((a:number,b:number)=>a+b,0)??""}</td>
                            </tr>
                            <tr>
                              <td className="label-col">Score</td>
                              {holes.map((h:any,i:number)=>{
                                const par=course?.hole_pars?.[startIdx+i];
                                const hNum=startIdx+i+1;
                                const wonSkin=skinHoleWinners[hNum]===gid;
                                return<td key={i} style={wonSkin?{background:"var(--gold-50,#fffbeb)"}:{}}>{h.gross_score&&par!=null?<ScoreSymbol gross={h.gross_score} par={par}/>:""}</td>;
                              })}
                              <td className="total-col">{grossTotal||""}</td>
                            </tr>
                            <tr>
                              <td className="label-col" style={{color:"var(--text-muted)",fontSize:10}}>Pts</td>
                              {holes.map((h:any,i:number)=>{
                                const hNum=startIdx+i+1;
                                const wonSkin=skinHoleWinners[hNum]===gid;
                                return<td key={i} style={{fontSize:10,...(wonSkin?{background:"var(--gold-50,#fffbeb)",fontWeight:700,color:"var(--gold-700)"}:{color:"var(--text-muted)"})}}>{h.stableford_points!=null?h.stableford_points:""}</td>;
                              })}
                              <td className="total-col" style={{color:"var(--green-700)"}}>{ptsTotal}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                    return(
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Scorecard</div>
                        {front9.length>0&&renderHalf(front9,0,"OUT",front9Gross,front9Pts)}
                        {back9.length>0&&renderHalf(back9,9,"IN",back9Gross,back9Pts)}
                        {front9.length>0&&back9.length>0&&(
                          <div>
                            </div>
                        )}
                      </div>
                    );
                  })()}
                  {hbhScores.length===0&&<div style={{fontSize:13,color:"var(--text-muted)",fontStyle:"italic",marginTop:4}}>Total-only entry -- no hole-by-hole data</div>}
                </>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  return(
    <div>
      <div className="section-title">Leaderboard</div>

      {/* 1) Season dropdown */}
      <div className="form-group" style={{marginBottom:12}}>
        <select className="form-select" value={selSeason} onChange={e=>{setSelSeason(parseInt(e.target.value));setSelEventId(null);setExpandedId(null);}}>
          {allSeasons.map(y=><option key={y} value={y}>{y} Season</option>)}
        </select>
      </div>

      <div className="tab-sub">
        {tabs.map(t=>(
          <button key={t.id} className={"tab-sub-btn"+(subTab===t.id?" active":"")} onClick={()=>{setSubTab(t.id);setExpandedId(null);}}>
            {t.id==="live"?<><span className="live-dot"/><span style={{fontWeight:700,letterSpacing:"0.05em"}}>LIVE</span></>:t.label}
          </button>
        ))}
      </div>

      {subTab==="live"&&liveEvent&&(()=>{
        const liveEntries=[...leaderboard.filter((r:any)=>r.event_id===liveEvent.event_id)]
          .sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
        const liveCourse=courses.find((c:any)=>c.course_name===liveEvent.course_name);

        // Build rows with THRU count from holeScores + fire streak detection
        const liveRows=liveEntries.map((entry:any)=>{
          const hs=holeScores
            .filter((h:any)=>h.summary_id===entry.summary_id)
            .sort((a:any,b:any)=>a.hole_number-b.hole_number);
          // Fire emoji: last hole >= 3 pts AND at least the 2 most recent holes both >= 3 pts
          let isOnFire=false;
          if(hs.length>=2){
            const last=hs[hs.length-1];
            const prev=hs[hs.length-2];
            isOnFire=(last.stableford_points>=3)&&(prev.stableford_points>=3);
          }
          return{...entry,thru:hs.length,hs,isOnFire};
        });

        // Assign tie positions
        let cp=1;
        const withPos=liveRows.map((r:any,i:number)=>{
          if(i>0&&liveRows[i].total_stableford_points===liveRows[i-1].total_stableford_points)
            return{...r,pos:cp,tied:true};
          cp=i+1; return{...r,pos:cp,tied:false};
        });
        const tiedSet=new Set(withPos.filter((r:any)=>r.tied).map((r:any)=>r.pos));
        const finalRows=withPos.map((r:any)=>tiedSet.has(r.pos)?{...r,tied:true}:r);

        const ScoreSymbolLive=({gross,par}:{gross:number,par:number})=>{
          const d=gross-par;
          const cls=d<=-2?"sc-eagle":d===-1?"sc-birdie":d===0?"sc-par":d===1?"sc-bogey":d===2?"sc-dbl":"sc-triple";
          return <span className={"sc-score "+cls}>{gross}</span>;
        };

        const renderLiveHalf=(hs:any[],startHole:number,label:string,pars:number[])=>{
          const cells=Array.from({length:9},(_,i)=>hs.find((h:any)=>h.hole_number===startHole+i+1)||null);
          const halfGross=cells.reduce((s:number,h:any)=>s+(h?.gross_score||0),0);
          const halfPts=cells.reduce((s:number,h:any)=>s+(h?.stableford_points||0),0);
          return(
            <div style={{overflowX:"auto",marginBottom:8}}>
              <table className="scorecard-table">
                <thead>
                  <tr><th>Hole</th>{cells.map((_,i)=><th key={i}>{startHole+i+1}</th>)}<th>{label}</th></tr>
                  <tr className="par-row"><th>Par</th>{cells.map((_,i)=><th key={i}>{pars[startHole+i]||"-"}</th>)}<th>{pars.slice(startHole,startHole+9).reduce((a:number,b:number)=>a+b,0)}</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{fontWeight:600,fontSize:12}}>Gross</td>
                    {cells.map((h:any,i:number)=>(
                      <td key={i}>{h?<ScoreSymbolLive gross={h.gross_score} par={pars[startHole+i]||4}/>:<span style={{color:"var(--border)"}}>·</span>}</td>
                    ))}
                    <td style={{fontWeight:700}}>{halfGross||""}</td>
                  </tr>
                  <tr>
                    <td style={{fontWeight:600,fontSize:12}}>Pts</td>
                    {cells.map((h:any,i:number)=>{
                      const p=h?.stableford_points;
                      const cls=p===4?"pts-eagle":p===3?"pts-birdie":p===2?"pts-par":p===1?"pts-bogey":p===0?"pts-zero":"";
                      return<td key={i} className={cls}>{h!=null?p:<span style={{color:"var(--border)"}}>·</span>}</td>;
                    })}
                    <td style={{fontWeight:700,color:"var(--green-700)"}}>{halfPts||""}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        };

        return(
          <div>
            {/* Event header */}
            <div style={{background:"linear-gradient(135deg,var(--green-900),var(--green-700))",borderRadius:"var(--radius-md)",padding:"12px 16px",color:"white",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",opacity:0.8,display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span className="live-dot" style={{background:"#ff6b6b"}}/>Scoring in Progress
                </div>
                <div style={{fontSize:16,fontWeight:700}}>{liveEvent.course_name}</div>
                <div style={{fontSize:13,opacity:0.7,marginTop:2}}>{formatDate(liveEvent.date)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:28,fontWeight:700,color:"var(--gold-300)"}}>{liveEntries.length}</div>
                <div style={{fontSize:11,opacity:0.65,letterSpacing:"0.06em",textTransform:"uppercase"}}>Scoring</div>
              </div>
            </div>

            {liveRows.length===0&&(
              <div className="empty-state">
                <div className="empty-text">No scores entered yet</div>
                <div className="empty-sub">Scores will appear here hole by hole as they are entered</div>
              </div>
            )}

            {finalRows.length>0&&(
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
                <div style={{display:"grid",gridTemplateColumns:"44px 1fr 56px 52px",padding:"8px 12px",background:"var(--green-900)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase"}}>POS</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textAlign:"left",marginLeft:5,textTransform:"uppercase"}}>Golfer</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"right"}}>PTS</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"right"}}>THRU</div>
                </div>

                {finalRows.map((row:any)=>{
                  const g=golfers.find((x:any)=>x.golfer_id===row.golfer_id);
                  const isExp=liveExpandedId===row.golfer_id;
                  const rankColor=row.pos===1?"var(--gold-500)":row.pos===2?"var(--text-secondary)":row.pos===3?"var(--earth-400,#9c7c65)":"var(--text-muted)";
                  const posLabel=(row.tied?"T":"")+row.pos;
                  const signup=signups.find((s:any)=>s.event_id===liveEvent.event_id&&s.golfer_id===row.golfer_id);
                  const playerCourse=signup?.tee_box_course_id
                    ?courses.find((c:any)=>c.course_id===signup.tee_box_course_id)
                    :liveCourse;
                  const pars:number[]=playerCourse?.hole_pars||[];
                  const front=row.hs.filter((h:any)=>h.hole_number<=9);
                  const back=row.hs.filter((h:any)=>h.hole_number>9);

                  return(
                    <div key={row.golfer_id}>
                      <div className="lb-live-row" onClick={()=>setLiveExpandedId(isExp?null:row.golfer_id)}>
                        <div style={{fontSize:18,fontWeight:700,color:rankColor}}>{posLabel}</div>
                        <div>
                          <div style={{fontSize:18,textAlign:"left",marginLeft:5,fontWeight:600}}>{g?g.first_name+" "+g.last_name:"Unknown"}{row.isOnFire&&<span style={{marginLeft:5,fontSize:16}} title="On fire -- 2+ consecutive holes of 3+ pts">🔥</span>}</div>
                          
                        </div>
                        <div style={{fontSize:20,fontWeight:700,color:"var(--green-700)",textAlign:"right"}}>{row.total_stableford_points||"--"}</div>
                        <div style={{fontSize:18,fontWeight:600,color:row.thru===18?"var(--green-600)":"var(--text-muted)",textAlign:"right"}}>
                          {row.thru===18?"F":row.thru||"--"}
                        </div>
                      </div>

                      {isExp&&(
                        <div className="lb-detail">
                          {row.hs.length>0&&playerCourse?(
                            <div>
                              <div style={{fontSize:12,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>
                                Live Scorecard · {playerCourse.tee_box_name} tees
                              </div>
                              {front.length>0&&renderLiveHalf(front,0,"OUT",pars)}
                              {back.length>0&&renderLiveHalf(back,9,"IN",pars)}
                            </div>
                          ):(
                            <div style={{fontSize:13,color:"var(--text-muted)",fontStyle:"italic"}}>No hole-by-hole data yet</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:10,textAlign:"center",paddingBottom:4}}>
              Updates as scores are entered · pull to refresh for latest
            </div>
          </div>
        );
      })()}

      {subTab==="season"&&(()=>{
        const isPastSeason=selSeason!==new Date().getFullYear();
        const qualRows=isPastSeason?seasonAvgWithTies.filter((r:any)=>r.qualified):seasonAvgWithTies;
        const dnqRows=isPastSeason?seasonAvgWithTies.filter((r:any)=>!r.qualified):[];
        return(
          <>
            {!isPastSeason&&<div style={{fontSize:13,color:"var(--text-muted)",marginBottom:10}}><span style={{color:"var(--gold-700)"}}>*</span> = fewer than 15 rounds (not yet qualified)</div>}
            {seasonAvg.length===0&&<div className="empty-state"><div className="empty-text">No rounds recorded</div></div>}
            {qualRows.length>0&&(
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)",marginBottom:isPastSeason&&dnqRows.length>0?16:0}}>
                <div className="lb-header">
                  <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
                  <div className="lb-header-cell right">Avg</div><div className="lb-header-cell right">Rnds</div>
                </div>
                {qualRows.map((row:any)=>renderLbRow(row,"season"))}
              </div>
            )}
            {isPastSeason&&dnqRows.length>0&&(
              <>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",margin:"16px 0 8px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{flex:1,borderTop:"1px solid var(--border)",display:"inline-block"}}></span>
                  Did Not Qualify ({"<"}15 rounds)
                  <span style={{flex:1,borderTop:"1px solid var(--border)",display:"inline-block"}}></span>
                </div>
                <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)",opacity:0.75}}>
                  <div className="lb-header">
                    <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
                    <div className="lb-header-cell right">Avg</div><div className="lb-header-cell right">Rnds</div>
                  </div>
                  {dnqRows.map((row:any)=>renderLbRow(row,"season"))}
                </div>
              </>
            )}
          </>
        );
      })()}

      {subTab==="top15"&&(()=>{
        const isPastSeason=selSeason!==new Date().getFullYear();
        const qualRows=isPastSeason?top15AvgWithTies.filter((r:any)=>r.qualified):top15AvgWithTies;
        const dnqRows=isPastSeason?top15AvgWithTies.filter((r:any)=>!r.qualified):[];
        return(
          <>
            {!isPastSeason&&<div style={{fontSize:13,color:"var(--text-muted)",marginBottom:10}}><span style={{color:"var(--gold-700)"}}>*</span> = fewer than 15 rounds (not yet qualified)</div>}
            {top15Avg.length===0&&<div className="empty-state"><div className="empty-text">No rounds recorded</div></div>}
            {qualRows.length>0&&(
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)",marginBottom:isPastSeason&&dnqRows.length>0?16:0}}>
                <div className="lb-header">
                  <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
                  <div className="lb-header-cell right">Avg</div><div className="lb-header-cell right">Rnds</div>
                </div>
                {qualRows.map((row:any)=>renderLbRow(row,"season"))}
              </div>
            )}
            {isPastSeason&&dnqRows.length>0&&(
              <>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",margin:"16px 0 8px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{flex:1,borderTop:"1px solid var(--border)",display:"inline-block"}}></span>
                  Did Not Qualify ({"<"}15 rounds)
                  <span style={{flex:1,borderTop:"1px solid var(--border)",display:"inline-block"}}></span>
                </div>
                <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)",opacity:0.75}}>
                  <div className="lb-header">
                    <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
                    <div className="lb-header-cell right">Avg</div><div className="lb-header-cell right">Rnds</div>
                  </div>
                  {dnqRows.map((row:any)=>renderLbRow(row,"season"))}
                </div>
              </>
            )}
          </>
        );
      })()}

      {subTab==="weekly"&&(
        <>
          <div className="form-group">
            <label className="form-label">Event</label>
            <select className="form-select" value={displayEvent?.event_id||""} onChange={e=>{setSelEventId(parseInt(e.target.value));setExpandedId(null);}}>
              {seasonEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
            </select>
          </div>
          {displayEvent&&(
            <>
              {!skinsEligible&&eventEntries.some((e:any)=>e.entry_type==="Total Only")&&(
                <div className="skins-warning"><span>⚠</span><span>Mixed entry -- skins cannot be calculated until all players have hole-by-hole scores.</span></div>
              )}
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-value">{paidEntries.length}</div><div className="stat-label">Players</div></div>
                <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)"}}>${totalPot}</div><div className="stat-label">Stableford Pot</div></div>
                {skinsEligible&&<div className="stat-card"><div className="stat-value" style={{color:"var(--green-700)"}}>${eventEntries.filter((e:any)=>e.skins_paid).length*10}</div><div className="stat-label">Skins Pot</div></div>}
                {hasLiveSkins&&<div className="stat-card"><div style={{fontSize:13,fontWeight:700,color:"var(--green-600)",marginBottom:2}}>✓ Skins Live</div><div className="stat-label">{Object.keys(liveSkinPayouts).length} winner{Object.keys(liveSkinPayouts).length!==1?"s":""}</div></div>}
              </div>
              {eventEntries.length>=2&&(()=>{
                const isTied=tied1st.length>1;
                // Tied 1st: show all tied players sharing full pot, no 2nd
                if(isTied){
                  return(
                    <div style={{display:"grid",gridTemplateColumns:"repeat("+Math.min(tied1st.length,4)+",1fr)",gap:10,marginBottom:18}}>
                      {tied1st.map((e:any)=>{
                        const payout=(totalPot/tied1st.length).toFixed(0);
                        return(
                          <div key={e.summary_id} className="podium-card p1">
                            <div className="podium-pos">🥇</div>
                            <div className="podium-pname">{golferName(golfers,e.golfer_id).split(" ")[0]}</div>
                            <div className="podium-pscore">{e.total_stableford_points} pts</div>
                            <div className="podium-payout">${payout}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                // Solo 1st: winner gets 2/3, runner-up gets 1/3
                const winner=paidEntries[0];
                // Find runner-up (first player with different score from winner)
                const runnerUp=paidEntries.find((e:any)=>e.total_stableford_points<(winner?.total_stableford_points??0));
                const winnerPayout=(totalPot*(2/3)).toFixed(0);
                // Runner-up payout splits 1/3 among all tied for 2nd
                const secondPts=runnerUp?.total_stableford_points;
                const tied2nd=secondPts!=null?paidEntries.filter((e:any)=>e.total_stableford_points===secondPts):[];
                const runnerUpPayout=tied2nd.length>0?((totalPot*(1/3))/tied2nd.length).toFixed(0):"0";
                return(
                  <div className="podium-row">
                    {winner&&(
                      <div className="podium-card p1">
                        <div className="podium-pos">🥇</div>
                        <div className="podium-pname">{golferName(golfers,winner.golfer_id).split(" ")[0]}</div>
                        <div className="podium-pscore">{winner.total_stableford_points} pts</div>
                        <div className="podium-payout">${winnerPayout}</div>
                      </div>
                    )}
                    {runnerUp&&(
                      <div className="podium-card p2">
                        <div className="podium-pos">🥈{tied2nd.length>1&&<span style={{fontSize:12,marginLeft:3}}>×{tied2nd.length}</span>}</div>
                        <div className="podium-pname">{tied2nd.length>1?"Tied 2nd":golferName(golfers,runnerUp.golfer_id).split(" ")[0]}</div>
                        <div className="podium-pscore">{runnerUp.total_stableford_points} pts</div>
                        <div className="podium-payout">${runnerUpPayout}{tied2nd.length>1?" ea":""}</div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
                <div className="lb-header" style={{gridTemplateColumns:"36px 1fr 56px 62px"}}>
                  <div className="lb-header-cell">POS</div><div className="lb-header-cell">Golfer</div>
                  <div className="lb-header-cell right">Pts</div><div className="lb-header-cell right">$$$</div>
                </div>
                {eventEntriesWithTies.map((entry:any)=>renderLbRow(entry,"weekly"))}
              </div>

              {/* View Scorecards button */}
              {displayEvent&&(()=>{
                const imgs=(eventImages||[]).filter((img:any)=>img.event_id===displayEvent.event_id);
                const compressAndUpload=async(file:File):Promise<string|null>=>{
                  return new Promise((resolve,reject)=>{
                    const imgEl=new Image();
                    const reader=new FileReader();
                    reader.onload=(e:any)=>{
                      imgEl.onload=async()=>{
                        try{
                          const MAX=1200;
                          const scale=Math.min(1,MAX/Math.max(imgEl.width,imgEl.height));
                          const canvas=document.createElement("canvas");
                          canvas.width=Math.round(imgEl.width*scale);
                          canvas.height=Math.round(imgEl.height*scale);
                          canvas.getContext("2d")?.drawImage(imgEl,0,0,canvas.width,canvas.height);
                          canvas.toBlob(async(blob:Blob|null)=>{
                            if(!blob){reject(new Error("Canvas toBlob failed"));return;}
                            // Path has no subfolder so the simple policy (bucket_id = 'scorecards') works
                            const path="event_"+displayEvent.event_id+"_"+Date.now()+".jpg";
                            try{
                              const result=await supabase.storage.upload("scorecards",path,blob);
                              if(!result){reject(new Error("Upload returned null"));return;}
                              // Insert metadata row — don't depend on the returned row having an id
                              const newImg={event_id:displayEvent.event_id,storage_path:path,public_url:result.url};
                              try{
                                const rows=await supabase.from("event_images").insert(newImg);
                                const savedImg=rows&&rows[0]?rows[0]:{...newImg,id:Date.now()};
                                setEventImages((p:any)=>[...p,savedImg]);
                              }catch(_:any){
                                // Insert failed but file is uploaded — still show it
                                setEventImages((p:any)=>[...p,{...newImg,id:Date.now()}]);
                              }
                              resolve(result.url);
                            }catch(uploadErr:any){
                              reject(uploadErr);
                            }
                          },"image/jpeg",0.82);
                        }catch(err:any){reject(err);}
                      };
                      imgEl.onerror=()=>reject(new Error("Image load failed"));
                      imgEl.src=e.target.result;
                    };
                    reader.onerror=()=>reject(new Error("FileReader failed"));
                    reader.readAsDataURL(file);
                  });
                };
                return(
                  <div style={{marginTop:18}}>
                    <button
                      className="btn btn-outline btn-full"
                      style={{fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}
                      onClick={()=>setShowScorecardModal(true)}
                    >
                      📷 View Scorecards{imgs.length>0?" ("+imgs.length+")":""}
                    </button>

                    {/* Scorecard modal */}
                    {showScorecardModal&&(
                      <div
                        style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:9000,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
                        onClick={()=>{setShowScorecardModal(false);setLightboxImg(null);}}
                      >
                        <div
                          style={{background:"var(--surface)",borderRadius:"var(--radius-lg) var(--radius-lg) 0 0",padding:"20px 16px 36px",width:"100%",maxWidth:520,maxHeight:"88vh",overflowY:"auto"}}
                          onClick={(e:any)=>e.stopPropagation()}
                        >
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                            <div>
                              <div style={{fontSize:17,fontWeight:700,color:"var(--green-800)"}}>Scorecards</div>
                              <div style={{fontSize:13,color:"var(--text-muted)"}}>{formatDate(displayEvent.date)} -- {displayEvent.course_name}</div>
                            </div>
                            {adminMode&&(
                              <label style={{cursor:"pointer"}}>
                                <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={async(e:any)=>{
                                  const files=Array.from(e.target.files||[]) as File[];
                                  if(!files.length)return;
                                  setScorecardUploading(true);
                                  let ok=0,fail=0;
                                  for(const f of files){
                                    try{
                                      await compressAndUpload(f);
                                      ok++;
                                    }catch(err:any){
                                      fail++;
                                      console.error("Upload error:",err);
                                      alert("Upload failed: "+( err?.message||String(err)));
                                    }
                                  }
                                  setScorecardUploading(false);
                                  e.target.value="";
                                  if(ok>0)showSuccess("Scorecard"+(ok>1?"s":"")+" uploaded!");
                                }}/>
                                <span className="btn btn-primary" style={{fontSize:13,padding:"8px 14px"}}>
                                  {scorecardUploading?"Uploading...":"+ Add Photo"}
                                </span>
                              </label>
                            )}
                          </div>

                          {imgs.length===0&&!scorecardUploading&&(
                            <div style={{textAlign:"center",padding:"32px 0",color:"var(--text-muted)"}}>
                              <div style={{fontSize:32,marginBottom:8}}>📋</div>
                              <div style={{fontSize:14}}>No scorecards uploaded yet</div>
                              {adminMode&&<div style={{fontSize:12,marginTop:4}}>Tap "+ Add Photo" to upload</div>}
                            </div>
                          )}

                          {scorecardUploading&&(
                            <div style={{textAlign:"center",padding:"20px 0",color:"var(--text-muted)",fontSize:14}}>
                              <div style={{width:32,height:32,border:"3px solid var(--green-100)",borderTop:"3px solid var(--green-600)",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 10px"}}/>
                              Compressing and uploading...
                            </div>
                          )}

                          {/* Image grid */}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                            {imgs.map((img:any)=>(
                              <div key={img.id||img.storage_path} style={{position:"relative",borderRadius:"var(--radius-md)",overflow:"hidden",aspectRatio:"4/3",background:"var(--surface2)",cursor:"pointer"}} onClick={()=>setLightboxImg(img.public_url)}>
                                <img src={img.public_url} alt="Scorecard" style={{width:"100%",height:"100%",objectFit:"cover"}} loading="lazy"/>
                                {adminMode&&(
                                  <button
                                    onClick={async(e:any)=>{
                                      e.stopPropagation();
                                      if(!window.confirm("Delete this scorecard photo?"))return;
                                      await supabase.storage.remove("scorecards",[img.storage_path]);
                                      await supabase.from("event_images").delete({id:img.id});
                                      setEventImages((p:any)=>p.filter((x:any)=>x.id!==img.id));
                                    }}
                                    style={{position:"absolute",top:4,right:4,background:"rgba(192,32,32,0.9)",color:"white",border:"none",borderRadius:6,padding:"4px 8px",fontSize:12,fontWeight:700,cursor:"pointer"}}
                                  >Delete</button>
                                )}
                              </div>
                            ))}
                          </div>

                          <button className="btn btn-outline btn-full" style={{marginTop:8}} onClick={()=>setShowScorecardModal(false)}>Close</button>
                        </div>
                      </div>
                    )}

                    {/* Lightbox */}
                    {lightboxImg&&(
                      <div
                        style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:9100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
                        onClick={()=>setLightboxImg(null)}
                      >
                        <img src={lightboxImg} alt="Scorecard" style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:"var(--radius-md)",objectFit:"contain"}}/>
                        <button onClick={()=>setLightboxImg(null)} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.15)",color:"white",border:"none",borderRadius:"50%",width:36,height:36,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}

    </div>
  );
}



function FinanceView({golfers,leaderboard,events,charityDonations,setCharityDonations,showSuccess}:any){
  const allSeasonsList=[...new Set(events.map((e:any)=>e.season))].sort((a:any,b:any)=>b-a) as number[];
  const currentSeason=allSeasonsList[0]||new Date().getFullYear();
  const [donationSeason,setDonationSeason]=useState<number|"all">(currentSeason);
  const [selEventId,setSelEventId]=useState(events[0]?.event_id||null);
  const [newDonationAmt,setNewDonationAmt]=useState("");
  const [newDonationNote,setNewDonationNote]=useState("");
  const [newDonationDate,setNewDonationDate]=useState(new Date().toISOString().split("T")[0]);
  const [editDonationId,setEditDonationId]=useState<number|null>(null);
  const [editDonationAmt,setEditDonationAmt]=useState("");
  const [editDonationNote,setEditDonationNote]=useState("");
  const [editDonationDate,setEditDonationDate]=useState("");

  const entries=leaderboard.filter((e:any)=>e.event_id===selEventId);
  const paidIn=entries.filter((e:any)=>e.buy_in_paid).length;
  const skinsPaid=entries.filter((e:any)=>e.skins_paid).length;
  const charityFromRounds=leaderboard.filter((e:any)=>e.charity_paid).length*5;
  const extraDonations=charityDonations.reduce((s:number,d:any)=>s+Number(d.amount),0);
  const lifetimeCharity=charityFromRounds+extraDonations;

  // Season-filtered donations
  const seasonEventIds=new Set(events.filter((e:any)=>donationSeason==="all"||e.season===donationSeason).map((e:any)=>e.event_id));
  const seasonCharityFromRounds=leaderboard.filter((e:any)=>e.charity_paid&&seasonEventIds.has(e.event_id)).length*5;
  const filteredDonations=donationSeason==="all"?charityDonations:charityDonations.filter((d:any)=>{
    const yr=d.date?parseInt(d.date.slice(0,4)):null;
    return yr===donationSeason;
  });
  const seasonExtraDonations=filteredDonations.reduce((s:number,d:any)=>s+Number(d.amount),0);
  const seasonCharity=seasonCharityFromRounds+seasonExtraDonations;

  const addDonation=()=>{
    if(!newDonationAmt)return;
    setCharityDonations((p:any)=>[...p,{id:Date.now(),amount:parseFloat(newDonationAmt),note:newDonationNote||"Donation",date:newDonationDate||new Date().toISOString().split("T")[0]}]);
    setNewDonationAmt(""); setNewDonationNote(""); setNewDonationDate(new Date().toISOString().split("T")[0]);
    showSuccess("Charity donation recorded");
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };
  const startEditDonation=(d:any)=>{setEditDonationId(d.id);setEditDonationAmt(String(d.amount));setEditDonationNote(d.note||"");setEditDonationDate(d.date||"");};
  const saveEditDonation=()=>{
    if(!editDonationAmt)return;
    setCharityDonations((p:any)=>p.map((d:any)=>d.id===editDonationId?{...d,amount:parseFloat(editDonationAmt),note:editDonationNote||"Donation",date:editDonationDate}:d));
    setEditDonationId(null);setEditDonationAmt("");setEditDonationNote("");setEditDonationDate("");
    showSuccess("Donation updated");
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };

  return(
    <div>
      <div className="charity-hero">
        <div className="charity-label">Lifetime Charity Pot</div>
        <div className="charity-amount">${lifetimeCharity.toLocaleString()}</div>
        <div className="charity-label" style={{marginTop:5}}>Rounds: ${charityFromRounds} · Donations: ${extraDonations.toFixed(0)}</div>
      </div>

      {/* 2a: Season-filtered donations view */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div className="card-title">Charity by Season</div>
        <select style={{fontSize:13,padding:"4px 8px",border:"1.5px solid var(--border-md)",borderRadius:"var(--radius-sm)",fontFamily:"DM Sans,sans-serif"}} value={donationSeason} onChange={e=>setDonationSeason(e.target.value==="all"?"all":parseInt(e.target.value))}>
          <option value="all">All Seasons</option>
          {allSeasonsList.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="card" style={{padding:"12px 16px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:14,color:"var(--text-muted)"}}>{donationSeason==="all"?"All seasons":donationSeason+" season"} charity</span>
          <span style={{fontFamily:"DM Serif Display,serif",fontSize:28,color:"var(--green-700)"}}>${seasonCharity.toLocaleString()}</span>
        </div>
        <div className="info-row"><span className="info-key">From rounds ($5/player)</span><span className="info-val money">${seasonCharityFromRounds}</span></div>
        <div className="info-row"><span className="info-key">Extra donations</span><span className="info-val money">${seasonExtraDonations.toFixed(0)}</span></div>
      </div>

      <div className="card-title" style={{marginBottom:8}}>Donations ({donationSeason==="all"?"All":donationSeason})</div>
      {filteredDonations.length===0&&<div style={{fontSize:13,color:"var(--text-muted)",marginBottom:10}}>No donations recorded for this period.</div>}
      {filteredDonations.map((d:any)=>(
        <div key={d.id}>
          {editDonationId===d.id?(
            <div className="card" style={{padding:"12px 14px",marginBottom:8}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--green-800)",marginBottom:8}}>Edit Donation</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">Amount ($)</label><input className="form-input" type="number" value={editDonationAmt} onChange={e=>setEditDonationAmt(e.target.value)}/></div>
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">Note</label><input className="form-input" value={editDonationNote} onChange={e=>setEditDonationNote(e.target.value)}/></div>
              </div>
              <div className="form-group" style={{marginBottom:8}}><label className="form-label">Date</label><input className="form-input" type="date" value={editDonationDate} onChange={e=>setEditDonationDate(e.target.value)}/></div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-primary" style={{flex:1}} onClick={saveEditDonation}>Save</button>
                <button className="btn btn-outline" onClick={()=>setEditDonationId(null)}>Cancel</button>
              </div>
            </div>
          ):(
            <div className="info-row">
              <span className="info-key">{d.note}</span>
              <span style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:"var(--text-muted)"}}>{d.date}</span>
                <span className="money">${Number(d.amount).toFixed(0)}</span>
                <button className="btn btn-sm btn-outline" onClick={()=>startEditDonation(d)}>Edit</button>
              </span>
            </div>
          )}
        </div>
      ))}
      <div className="card" style={{marginTop:10}}>
        <div className="card-title" style={{marginBottom:10}}>Add Donation</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Amount ($)</label><input className="form-input" type="number" min="0" placeholder="50" value={newDonationAmt} onChange={e=>setNewDonationAmt(e.target.value)}/></div>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Note</label><input className="form-input" placeholder="e.g. Birthday" value={newDonationNote} onChange={e=>setNewDonationNote(e.target.value)}/></div>
        </div>
        <div className="form-group" style={{marginBottom:10}}><label className="form-label">Date</label><input className="form-input" type="date" value={newDonationDate} onChange={e=>setNewDonationDate(e.target.value)}/></div>
        <button className="btn btn-primary btn-full" onClick={addDonation} disabled={!newDonationAmt}>Record Donation</button>
      </div>

      <hr className="divider"/>
      <div className="form-group">
        <label className="form-label">Event Breakdown</label>
        <select className="form-select" value={selEventId||""} onChange={e=>setSelEventId(parseInt(e.target.value))}>
          {[...events].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
        </select>
      </div>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-value">${paidIn*20}</div><div className="stat-label">Stableford Pot</div></div>
        <div className="stat-card"><div className="stat-value">${skinsPaid*10}</div><div className="stat-label">Skins Pot</div></div>
        <div className="stat-card"><div className="stat-value">${entries.filter((e:any)=>e.charity_paid).length*5}</div><div className="stat-label">Charity This Event</div></div>
        <div className="stat-card"><div className="stat-value">${paidIn*20+skinsPaid*10+entries.filter((e:any)=>e.charity_paid).length*5}</div><div className="stat-label">Total Collected</div></div>
      </div>

    </div>
  );
}


// ============================================================
// WEATHER WIDGET  -- Open-Meteo, free, no API key required
//
// GPS accuracy note: we use exact course coordinates rather than
// the ZIP 92612 centroid (~33.6459,-117.8428). The ZIP centroid
// is 2.5-3 miles from either course -- at Open-Meteo's 1-2km
// grid resolution that is 2-3 grid cells, which can meaningfully
// differ in wind speed/direction near coastal Southern California.
// Exact GPS gives the best possible forecast for each course.
// ============================================================

const COURSE_COORDS:Record<string,{lat:number,lon:number}>={
  "Strawberry Farms GC":{lat:33.6695,lon:-117.8228},
  "Oak Creek GC"       :{lat:33.6541,lon:-117.7993},
};
const FALLBACK_COORDS={lat:33.6459,lon:-117.8428}; // ZIP 92612 centroid

function wmoToDesc(code:number):{label:string,emoji:string}{
  if(code===0)return{label:"Clear sky",emoji:"☀️"};
  if(code<=2) return{label:"Partly cloudy",emoji:"⛅"};
  if(code===3)return{label:"Overcast",emoji:"☁️"};
  if(code<=49)return{label:"Foggy",emoji:"🌫️"};
  if(code<=59)return{label:"Drizzle",emoji:"🌦️"};
  if(code<=69)return{label:"Rain",emoji:"🌧️"};
  if(code<=79)return{label:"Snow",emoji:"❄️"};
  if(code<=82)return{label:"Showers",emoji:"🌧️"};
  if(code<=86)return{label:"Snow showers",emoji:"🌨️"};
  if(code<=99)return{label:"Thunderstorm",emoji:"⛈️"};
  return{label:"Unknown",emoji:"🌡️"};
}
function degToCompass(d:number):string{
  const a=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return a[Math.round(d/22.5)%16];
}
function cloudText(pct:number):string{
  if(pct<=10)return"Clear";
  if(pct<=30)return"Mostly clear";
  if(pct<=60)return"Partly cloudy";
  if(pct<=85)return"Mostly cloudy";
  return"Overcast";
}

// useWeather: fetches forecast for a course on a date,
// returns {wx, loading} where wx has temp/code/wind/windDeg fields.
// RSVPTab renders this inline inside the existing event card.
function useWeather(courseName:string, eventDate:string){
  const [wx,setWx]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if(!eventDate||!courseName){setWx(null);return;}
    const msPerDay=86400000;
    const daysOut=Math.round((new Date(eventDate+"T12:00:00").getTime()-Date.now())/msPerDay);
    if(daysOut<0||daysOut>15){setWx(null);return;}
    const coords=COURSE_COORDS[courseName]||FALLBACK_COORDS;
    setLoading(true);
    fetch("https://api.open-meteo.com/v1/forecast"
      +"?latitude="+coords.lat+"&longitude="+coords.lon
      +"&hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode"
      +"&temperature_unit=fahrenheit&windspeed_unit=mph"
      +"&forecast_days=16&timezone=America%2FLos_Angeles")
      .then(r=>r.json())
      .then(data=>{
        const times:string[]=data.hourly.time;
        const idxs=times.map((t:string,i:number)=>({t,i}))
          .filter(({t}:any)=>t.startsWith(eventDate)&&parseInt(t.slice(11,13))>=7&&parseInt(t.slice(11,13))<=12)
          .map(({i}:any)=>i);
        if(!idxs.length){setWx(null);setLoading(false);return;}
        const avg=(k:string)=>{
          const v=idxs.map((i:number)=>data.hourly[k][i]).filter((x:any)=>x!=null);
          return v.length?Math.round(v.reduce((a:number,b:number)=>a+b,0)/v.length):0;
        };
        const codes:number[]=idxs.map((i:number)=>data.hourly.weathercode[i]);
        const freq:Record<number,number>={};
        codes.forEach((c:number)=>{freq[c]=(freq[c]||0)+1;});
        const dominant=parseInt(Object.entries(freq).sort((a:any,b:any)=>b[1]-a[1])[0][0]);
        setWx({temp:avg("temperature_2m"),wind:avg("windspeed_10m"),windDeg:avg("winddirection_10m"),code:dominant});
        setLoading(false);
      })
      .catch(()=>setLoading(false));
  },[eventDate,courseName]);
  return{wx,loading};
}

// ============================================================
// SIGN-UP TAB  (#3a show all tee times, #3b two sub-tabs)
// ============================================================
function RSVPTab({golfers,courses,events,setEvents,signups,setSignups,showSuccess,adminMode}:any){
  const upcomingEvents=[...events].filter((e:any)=>e.status!=="Completed").sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  const [selEventId,setSelEventId]=useState<number>(upcomingEvents[0]?.event_id||0);
  const [subTab,setSubTab]=useState("rsvp");
  const [pairingsConfirmed,setPairingsConfirmed]=useState(false);
  const [moving,setMoving]=useState<{signup_id:number,gid:number,fromTee:string}|null>(null);
  const [guestName,setGuestName]=useState("");
  const [guestSponsor,setGuestSponsor]=useState("");
  const [guestHcp,setGuestHcp]=useState("18");

  const selEvent=events.find((e:any)=>e.event_id===selEventId);
  const eventSignups=signups.filter((s:any)=>s.event_id===selEventId);
  const {wx:forecastWx}=useWeather(selEvent?.course_name||"",selEvent?.date||"");
  const yesCount=eventSignups.filter((s:any)=>s.attending==="Yes").length;
  const noCount=eventSignups.filter((s:any)=>s.attending==="No").length;
  const unconfCount=eventSignups.filter((s:any)=>s.attending==="Unconfirmed").length;

  // 2b) Toggle: clicking the already-active button resets to Unconfirmed
  const updateAttending=(signup_id:number,val:string,gid:number,current:string)=>{
    const next=current===val?"Unconfirmed":val;
    setSignups((p:any)=>p.map((s:any)=>s.signup_id===signup_id?{...s,attending:next}:s));
    showSuccess(next==="Unconfirmed"?`RSVP cleared for ${golferName(golfers,gid)}`:`RSVP updated for ${golferName(golfers,gid)}`);
  };

  const addGuest=()=>{
    if(!guestName.trim()||!guestSponsor)return;
    const [fn,...rest]=guestName.trim().split(" ");
    const ln=rest.join(" ")||"Guest";
    const newGolferId=Date.now();
    const newGolfer={golfer_id:newGolferId,first_name:fn,last_name:ln,email_address:"",current_handicap_index:parseFloat(guestHcp)||18,is_guest:true,status:"Active"};
    window.dispatchEvent(new CustomEvent("addGolfer",{detail:newGolfer}));
    setSignups((p:any)=>[...p,{signup_id:Date.now()+1,event_id:selEventId,golfer_id:newGolferId,attending:"Yes",assigned_tee_time:null,tee_box_course_id:null,playing_handicap:null,is_guest_entry:true,sponsor_golfer_id:parseInt(guestSponsor)}]);
    setGuestName(""); setGuestSponsor(""); setGuestHcp("18");
    showSuccess(`Guest ${fn} ${ln} added`);
  };

  const buildReminderBody=()=>{
    if(!selEvent)return"";
    const going=eventSignups.filter((s:any)=>s.attending==="Yes").map((s:any)=>golferName(golfers,s.golfer_id));
    const out=eventSignups.filter((s:any)=>s.attending==="No").map((s:any)=>golferName(golfers,s.golfer_id));
    const unconf=eventSignups.filter((s:any)=>s.attending==="Unconfirmed").map((s:any)=>golferName(golfers,s.golfer_id));
    return`Saturday School - RSVP Reminder\n${formatDate(selEvent.date)} @ ${selEvent.course_name}\nTee times: ${selEvent.tee_times.join(", ")}\n\n✅ Going (${going.length}):\n${going.map((n:string)=>`  * ${n}`).join("\n")}\n\n❓ No response yet (${unconf.length}):\n${unconf.map((n:string)=>`  * ${n}`).join("\n")}\n\n❌ Not attending (${out.length}):\n${out.map((n:string)=>`  * ${n}`).join("\n")}\n\nPlease update your RSVP!`;
  };

  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);
  const mailtoLink=`mailto:?cc=${allEmails.join(",")}&subject=Saturday School - RSVP Reminder ${formatDate(selEvent?.date)}&body=${encodeURIComponent(buildReminderBody())}`;

  // Pairing view
  const pairingsByTee = selEvent?.tee_times
    ?selEvent.tee_times.map((tt:string)=>({teeTime:tt,players:eventSignups.filter((s:any)=>s.assigned_tee_time===tt&&s.attending==="Yes")}))
    :[];
  const hasPairings=pairingsByTee.some((g:any)=>g.players.length>0);
  useEffect(()=>{setPairingsConfirmed(false);setMoving(null);},[selEventId]);

  if(upcomingEvents.length===0)return<div className="empty-state"><div className="empty-text">No upcoming events</div></div>;

  const movePlayer=(signup_id:number,toTee:string)=>{
    setSignups((p:any)=>p.map((s:any)=>s.signup_id===signup_id?{...s,assigned_tee_time:toTee}:s));
    if(signup_id<1e12)
      supabase.from("event_signups").update({assigned_tee_time:toTee},{signup_id}).catch(()=>{});
    setMoving(null);
  };

  const allPairingEmails=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);

  const buildPairingBody=()=>{
    if(!selEvent)return"";
    const nl="\n";
    let b="Saturday School - Pairings"+nl+formatDate(selEvent.date)+" @ "+selEvent.course_name+nl+nl;
    pairingsByTee.filter((g:any)=>g.players.length>0).forEach((grp:any,i:number)=>{
      b+="Group "+(i+1)+" - Tee: "+grp.teeTime+nl;
      grp.players.forEach((su:any)=>{
        const gl=golfers.find((x:any)=>x.golfer_id===su.golfer_id);
        b+="  * "+(gl?gl.first_name+" "+gl.last_name:"Guest")+(gl?.is_guest?" (Guest)":"")+nl;
      });
      b+=nl;
    });
    return b;
  };
  return(
    <div>
      <div className="section-title">Sign Up</div>
      <div className="section-sub">RSVP for upcoming rounds</div>

      <div className="form-group">
        <label className="form-label">Select Event</label>
        <select className="form-select" value={selEventId} onChange={e=>setSelEventId(parseInt(e.target.value))}>
          {upcomingEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
        </select>
      </div>

      {/* Event summary card -- status, tee times, and inline weather row */}
      {selEvent&&(
        <div className="card" style={{padding:"12px 16px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:17}}>{selEvent.course_name}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
              <span className="pill pill-green">✓ {yesCount}</span>
              {noCount>0&&<span className="pill pill-red">✗ {noCount}</span>}
              {unconfCount>0&&<span className="pill pill-gray">? {unconfCount}</span>}
            </div>
          </div>
          <div className="info-row"><span className="info-key">Status</span><span className="pill pill-gold">{selEvent.status}</span></div>
          <div className="info-row">
            <span className="info-key">Tee Times</span>
            <span className="info-val" style={{textAlign:"right"}}>
              {selEvent.tee_times.map((t:string,i:number)=>(
                <span key={i} style={{display:"inline-block",background:"var(--green-50)",border:"1px solid var(--green-100)",borderRadius:6,padding:"2px 8px",marginLeft:4,fontSize:14,fontWeight:600,color:"var(--green-700)"}}>{t}</span>
              ))}
            </span>
          </div>
          {forecastWx&&(()=>{
            const d=wmoToDesc(forecastWx.code);
            return(
              <div className="info-row" style={{marginTop:2,paddingTop:8}}>
                <span className="info-key">Forecast</span>
                <span className="info-val" style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <span style={{fontSize:18,lineHeight:1}}>{d.emoji}</span>
                  <span style={{fontWeight:600,fontSize:14,color:"var(--text-primary)"}}>{forecastWx.temp}°F</span>
                  <span style={{fontSize:13,color:"var(--text-secondary)"}}>{d.label}</span>
                  <span style={{fontSize:13,color:"var(--text-muted)"}}>{forecastWx.wind} mph {degToCompass(forecastWx.windDeg)}</span>
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* #3b - two sub-tabs: RSVP | View Pairings */}
      <div className="toggle-group">
        <button className={`toggle-btn${subTab==="rsvp"?" active":""}`} onClick={()=>setSubTab("rsvp")}>RSVP</button>
        <button className={`toggle-btn${subTab==="pairings"?" active":""}`} onClick={()=>setSubTab("pairings")}>View Pairings</button>
      </div>

      {subTab==="rsvp"&&(
        <>
          <div className="card-title" style={{marginBottom:10}}>Member RSVPs</div>
          {[...eventSignups.filter((s:any)=>!s.is_guest_entry)].sort((a:any,b:any)=>{
            const ga=golfers.find((x:any)=>x.golfer_id===a.golfer_id);
            const gb=golfers.find((x:any)=>x.golfer_id===b.golfer_id);
            if(!ga||!gb)return 0;
            return (ga.first_name||"").localeCompare(gb.first_name||"");
          }).map((signup:any)=>{
            const g=golfers.find((x:any)=>x.golfer_id===signup.golfer_id);
            if(!g)return null;
            const myGuests=eventSignups.filter((s:any)=>s.is_guest_entry&&s.sponsor_golfer_id===g.golfer_id);
            return(
              <div key={signup.signup_id}>
                <div className="rsvp-row">
                  <div className="rsvp-name">{g.first_name} {g.last_name}
                    {myGuests.length>0&&<span style={{fontSize:12,color:"var(--gold-700)",marginLeft:6}}>+{myGuests.length} guest{myGuests.length>1?"s":""}</span>}
                  </div>
                  <div className="rsvp-actions">
                    <button className={`rsvp-btn yes${signup.attending==="Yes"?" active":""}`} onClick={()=>updateAttending(signup.signup_id,"Yes",g.golfer_id,signup.attending)}>In</button>
                    <button className={`rsvp-btn no${signup.attending==="No"?" active":""}`} onClick={()=>updateAttending(signup.signup_id,"No",g.golfer_id,signup.attending)}>Out</button>
                  </div>
                </div>
                {myGuests.map((gs:any)=>{
                  const gg=golfers.find((x:any)=>x.golfer_id===gs.golfer_id);
                  return(
                    <div key={gs.signup_id} className="rsvp-row" style={{paddingLeft:20,background:"var(--gold-50)"}}>
                      <div className="rsvp-name" style={{fontSize:15,color:"var(--gold-800)"}}>↳ {gg?`${gg.first_name} ${gg.last_name}`:"Guest"} <span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px"}}>guest</span></div>
                      <div className="rsvp-actions">
                        <button className={`rsvp-btn yes${gs.attending==="Yes"?" active":""}`} onClick={()=>updateAttending(gs.signup_id,"Yes",gs.golfer_id,gs.attending)}>In</button>
                        <button className={`rsvp-btn no${gs.attending==="No"?" active":""}`} onClick={()=>updateAttending(gs.signup_id,"No",gs.golfer_id,gs.attending)}>Out</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <hr className="divider"/>
          <div className="card-title" style={{marginBottom:10}}>Add Guest</div>
          <div className="form-group"><label className="form-label">Guest Full Name</label><input className="form-input" placeholder="First Last" value={guestName} onChange={e=>setGuestName(e.target.value)}/></div>
          <div className="form-group">
            <label className="form-label">Sponsor (Member bringing guest)</label>
            <select className="form-select" value={guestSponsor} onChange={e=>setGuestSponsor(e.target.value)}>
              <option value="">Select member…</option>
              {golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=><option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Guest Handicap Index</label><input className="form-input" type="number" step="0.1" min="0" max="54" value={guestHcp} onChange={e=>setGuestHcp(e.target.value)}/></div>
          <button className="btn btn-gold btn-full" disabled={!guestName.trim()||!guestSponsor} onClick={addGuest}>+ Add Guest to Event</button>

          {adminMode&&(
            <>
              <hr className="divider"/>
              <div className="card-title" style={{marginBottom:6}}>Send Reminder</div>
              <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:10}}>Emails the full group with current RSVP status -- includes tee time schedule.</p>
              <a href={mailtoLink} className="btn btn-outline btn-full" style={{textDecoration:"none"}}>✉ Send RSVP Reminder</a>
            </>
          )}
        </>
      )}

      {subTab==="pairings"&&(
        <>
          {/* Generate / Re-generate button */}
          {adminMode&&selEvent&&(
            <button
              className="btn btn-gold btn-full"
              style={{marginBottom:14,fontWeight:700}}
              onClick={()=>{
                const attending=eventSignups.filter((s:any)=>s.attending==="Yes");
                if(attending.length<2){alert("Need at least 2 players confirmed In to generate pairings.");return;}
                const attendees=attending.map((s:any)=>({golfer_id:s.golfer_id,sponsor_golfer_id:s.sponsor_golfer_id}));
                const newPairings=runPairingEngine(attendees,selEvent.tee_times||[]);
                const teeByGolfer:Record<number,string>={};
                newPairings.forEach((grp:any)=>grp.players.forEach((pid:number)=>{teeByGolfer[pid]=grp.teeTime;}));
                const updatedSignups=eventSignups.map((s:any)=>
                  teeByGolfer[s.golfer_id]!==undefined?{...s,assigned_tee_time:teeByGolfer[s.golfer_id]}:s
                );
                setSignups((su:any)=>su.map((s:any)=>{
                  const u=updatedSignups.find((x:any)=>x.signup_id===s.signup_id);
                  return u||s;
                }));
                updatedSignups.filter((s:any)=>teeByGolfer[s.golfer_id]).forEach((s:any)=>{
                  if(s.signup_id<1e12)
                    supabase.from("event_signups").update({assigned_tee_time:s.assigned_tee_time},{signup_id:s.signup_id}).catch(()=>{});
                });
                setEvents((ev:any)=>ev.map((e:any)=>e.event_id===selEvent.event_id?{...e,status:"Pairings Set"}:e));
                setMoving(null);setPairingsConfirmed(false);
              }}
            >🎲 {hasPairings?"Re-generate Pairings":"Generate Pairings"}</button>
          )}

          {/* Move hint */}
          {adminMode&&hasPairings&&(
            <div style={{fontSize:13,color:"var(--text-muted)",marginBottom:8}}>
              {moving
                ?<span style={{color:"var(--gold-700)",fontWeight:600}}>
                    Moving {golferName(golfers,moving.gid).split(" ")[0]} -- tap a group to move them there
                    {" "}<button style={{background:"none",border:"none",color:"var(--red-600)",cursor:"pointer",fontSize:13,fontWeight:600}} onClick={()=>setMoving(null)}>Cancel</button>
                  </span>
                :"Tap a player name to move them to another group"}
            </div>
          )}

          {/* Pairing groups */}
          {!hasPairings
            ?<div className="empty-state"><div className="empty-text">Pairings not yet set</div><div className="empty-sub">{adminMode?"Tap Generate Pairings above":"Check back after the admin sets pairings"}</div></div>
            :pairingsByTee.filter((g:any)=>g.players.length>0).map((group:any,gi:number)=>{
              const isDropTarget=adminMode&&moving&&moving.fromTee!==group.teeTime;
              return(
                <div
                  key={gi}
                  className="pairing-card"
                  style={isDropTarget?{borderColor:"var(--green-400)",cursor:"pointer"}:{}}
                  onClick={()=>{if(isDropTarget&&moving)movePlayer(moving.signup_id,group.teeTime);}}
                >
                  <div className="pairing-header">
                    <span className="pairing-time">⏱ {group.teeTime}</span>
                    <span className="pairing-group">
                      Group {gi+1} · {group.players.length} players
                      {isDropTarget?" -- tap to move here":""}
                    </span>
                  </div>
                  <div className="pairing-body">
                    {group.players.map((su:any)=>{
                      const g=golfers.find((x:any)=>x.golfer_id===su.golfer_id);
                      const isMoving=moving?.signup_id===su.signup_id;
                      return(
                        <div
                          key={su.signup_id}
                          className="pairing-player"
                          style={{background:isMoving?"var(--gold-50)":undefined,cursor:adminMode?"pointer":"default"}}
                          onClick={(e:any)=>{
                            e.stopPropagation();
                            if(!adminMode)return;
                            if(moving&&moving.signup_id===su.signup_id){setMoving(null);return;}
                            if(!moving)setMoving({signup_id:su.signup_id,gid:su.golfer_id,fromTee:group.teeTime});
                          }}
                        >
                          <div>
                            <span style={{fontWeight:500,color:isMoving?"var(--gold-700)":undefined}}>
                              {g?`${g.first_name} ${g.last_name}`:"Guest"}{isMoving?" ✋":""}
                            </span>
                            {su.is_guest_entry&&<span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px",marginLeft:6,color:"var(--gold-800)"}}>guest</span>}
                          </div>
                          <span className="pairing-hcp" style={{color:"var(--text-muted)",fontSize:13}}>HCP {g?.current_handicap_index?.toFixed(1)??""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          }

          {/* Confirm + Email */}
          {adminMode&&hasPairings&&(
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button
                className="btn btn-primary"
                style={{flex:1}}
                onClick={()=>{
                  setEvents((p:any)=>p.map((e:any)=>e.event_id===selEvent?.event_id?{...e,status:"Pairings Set"}:e));
                  setPairingsConfirmed(true);
                  showSuccess("Pairings confirmed");
                }}
              >{pairingsConfirmed?"✓ Update Pairings":"Confirm Pairings"}</button>
              <a
                href={"mailto:?cc="+allPairingEmails.join(",")+"&subject="+encodeURIComponent("Saturday School Pairings - "+formatDate(selEvent?.date))+"&body="+encodeURIComponent(buildPairingBody())}
                className="btn btn-outline"
                style={{flex:1,textDecoration:"none"}}
              >✉ Email</a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// SCORE ENTRY  (#4a up to 4 golfers at once, #5a skins warning)
// ============================================================
const emptyScorer=()=>({golferId:"",courseId:"",totalPts:"",grossScores:Array(18).fill(""),submitted:false,started:false,summaryId:null as number|null});

function ScoreEntryTab({golfers,courses,events,signups,setSignups,leaderboard,setLeaderboard,holeScores,setHoleScores,setEvents,dbUpsertHoleScore,scoreMode,setScoreMode,scoreEventId,setScoreEventId,scorers,setScorers,showSuccess}:any){
  // State is lifted to App so it survives tab navigation
  const mode=scoreMode;
  const setMode=setScoreMode;
  const selEventId=scoreEventId;
  const setSelEventId=setScoreEventId;
  // scorers/setScorers are passed directly from App

  // Track in-flight leaderboard inserts per "eid:gid" key.
  // Prevents duplicate INSERT when user types quickly on first hole.
  const pendingLbInsert=useRef<Record<string,Array<(id:number)=>void>>>({});

  const activeEvents=events.filter((e:any)=>e.status==="Pairings Set"||e.status==="In-Progress");
  const selEvent=events.find((e:any)=>e.event_id===parseInt(selEventId));
  const availableTees=selEvent?courses.filter((c:any)=>c.course_name===selEvent.course_name):[];

  // Check skins eligibility warning for this event
  const eventEntries=leaderboard.filter((r:any)=>r.event_id===selEvent?.event_id);
  const hasMixedEntry=eventEntries.length>0&&eventEntries.some((r:any)=>r.entry_type==="Total Only");

  const addScorer=()=>{if(scorers.length<4)setScorers(p=>[...p,emptyScorer()]);};
  const removeScorer=(idx:number)=>setScorers(p=>p.filter((_,i)=>i!==idx));

  // Creates the leaderboard row in DB immediately so every subsequent hole
  // write has a real summary_id — no async race conditions.
  const startScoring=async(idx:number)=>{
    const scorer=scorers[idx];
    if(!scorer.golferId||!scorer.courseId||!selEventId)return;
    const gid=parseInt(scorer.golferId);
    const eid=parseInt(selEventId);
    const course=courses.find((c:any)=>c.course_id===parseInt(scorer.courseId));
    const g=golfers.find((x:any)=>x.golfer_id===gid);
    if(!g||!course)return;
    const phcp=calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par);

    // Check if a row already exists (resume case)
    const existing=leaderboard.find((r:any)=>r.event_id===eid&&r.golfer_id===gid);
    if(existing&&existing.summary_id<1e12){
      // Already have a real row — restore hole scores and mark started
      const hs=holeScores.filter((h:any)=>h.summary_id===existing.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number);
      const gross=Array(18).fill("");
      hs.forEach((h:any)=>{gross[h.hole_number-1]=String(h.gross_score);});
      setScorers(p=>p.map((s,i)=>i===idx?{...s,grossScores:gross,started:true,summaryId:existing.summary_id}:s));
      // Flip event to In-Progress if needed
      setEvents((evs:any)=>evs.map((ev:any)=>ev.event_id===eid&&ev.status==="Pairings Set"?{...ev,status:"In-Progress"}:ev));
      return;
    }

    // INSERT a 0-point placeholder row to get the real summary_id before any holes
    const placeholder:any={
      event_id:eid, golfer_id:gid,
      season:selEvent?.season||new Date().getFullYear(),
      entry_type:"Hole-by-Hole", total_stableford_points:0,
      buy_in_paid:true, skins_paid:true, charity_paid:true,
      weekly_payout_won:0, skins_payout_won:0
    };
    try{
      const rows=await supabase.from("event_leaderboard").insert(placeholder);
      if(!rows||!rows[0])throw new Error("No row returned");
      const realId:number=rows[0].summary_id;
      // Patch local leaderboard state with the real row
      setLeaderboard((p:any)=>[...p.filter((r:any)=>!(r.event_id===eid&&r.golfer_id===gid)),{...placeholder,summary_id:realId}]);
      // Mark scorer as started with the real summary_id
      setScorers(p=>p.map((s,i)=>i===idx?{...s,started:true,summaryId:realId}:s));
      // Write tee box to signup so restore works
      setSignups((su:any)=>{
        const su2=su.map((s:any)=>s.event_id===eid&&s.golfer_id===gid?{...s,tee_box_course_id:parseInt(scorer.courseId),playing_handicap:phcp}:s);
        const mySu=su2.find((s:any)=>s.event_id===eid&&s.golfer_id===gid);
        if(mySu?.signup_id&&mySu.signup_id<1e12)
          supabase.from("event_signups").update({tee_box_course_id:parseInt(scorer.courseId),playing_handicap:phcp},{signup_id:mySu.signup_id}).catch(()=>{});
        return su2;
      });
      // Flip event to In-Progress
      setEvents((evs:any)=>evs.map((ev:any)=>ev.event_id===eid&&ev.status==="Pairings Set"?{...ev,status:"In-Progress"}:ev));
    }catch(e:any){
      showSuccess("Error starting scoring: "+(e?.message||"unknown"));
    }
  };

  const updateScorer=(idx:number,field:string,val:any)=>{
    setScorers(p=>{
      const updated=p.map((s,i)=>i===idx?{...s,[field]:val}:s);

      // When a golfer is selected in H-H mode, auto-restore their in-progress round
      if(field==="golferId"&&val&&mode==="hole"&&selEventId){
        const eid=parseInt(selEventId);
        const gid=parseInt(val);
        const existing=leaderboard.find((r:any)=>r.event_id===eid&&r.golfer_id===gid&&r.entry_type==="Hole-by-Hole");
        if(existing){
          // Restore tee box from signup
          const signup=signups.find((s:any)=>s.event_id===eid&&s.golfer_id===gid&&s.tee_box_course_id);
          const courseId=signup?.tee_box_course_id?String(signup.tee_box_course_id):"";
          // Restore gross scores from hole_scores
          const hs=holeScores.filter((h:any)=>h.summary_id===existing.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number);
          const gross=Array(18).fill("");
          hs.forEach((h:any)=>{gross[h.hole_number-1]=String(h.gross_score);});
          return updated.map((s,i)=>i===idx?{...s,golferId:val,courseId,grossScores:gross}:s);
        }
      }
      return updated;
    });
  };
  const updateGross=(idx:number,hole:number,val:string)=>{
    // -- Step 1: update React state immediately so UI is responsive --
    const currentScorer=scorers[idx];
    if(!currentScorer)return;
    const newGross=[...currentScorer.grossScores]; newGross[hole]=val;
    const updatedScorer={...currentScorer,grossScores:newGross};
    setScorers(scorers.map((s,i)=>i===idx?updatedScorer:s));

    if(!updatedScorer.golferId||!updatedScorer.courseId)return;
    const gid=parseInt(updatedScorer.golferId);
    const eid=parseInt(selEventId);
    if(!eid)return;
    const course=courses.find((c:any)=>c.course_id===parseInt(updatedScorer.courseId));
    const g=golfers.find((x:any)=>x.golfer_id===gid);
    if(!g||!course)return;

    const phcp=calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par);
    const grossVal=parseInt(val);

    // Compute running total from the updated gross array
    const holeCalcs=calcHoleScores(newGross,phcp,course);
    const runningPts=holeCalcs.reduce((s:number,h:any)=>s+(h.points??0),0);

    // -- Step 2: update holeScores state for LIVE scorecard --
    // Use real summary_id if the leaderboard row exists in DB, otherwise use a
    // stable temp id keyed by eid+gid so local state is always populated immediately.
    const existing=leaderboard.find((r:any)=>r.event_id===eid&&r.golfer_id===gid);
    const tempSid:number=existing?.summary_id||(Date.now()+gid);
    // Always update local holeScores state immediately so the LIVE tab reflects each
    // keystroke regardless of whether the DB leaderboard row exists yet.
    if(val&&!isNaN(grossVal)){
      const net=calcHoleNetScore(grossVal,phcp,course.hole_stroke_indices[hole]);
      const pts=calcStablefordPoints(net,course.hole_pars[hole]);
      const holeRow={score_id:tempSid*100+hole,summary_id:tempSid,hole_number:hole+1,gross_score:grossVal,net_score:net,stableford_points:pts};
      setHoleScores((hs:any)=>[...hs.filter((h:any)=>!(h.summary_id===tempSid&&h.hole_number===hole+1)),holeRow]);
      // If we already have a real DB row, upsert directly. Otherwise the queued
      // flush in the .then() below will write it with the real summary_id.
      if(existing?.summary_id&&existing.summary_id<1e12){
        if(dbUpsertHoleScore) dbUpsertHoleScore({...holeRow,summary_id:existing.summary_id,score_id:existing.summary_id*100+hole});
      }
    } else if(!val){
      setHoleScores((hs:any)=>hs.filter((h:any)=>!(h.summary_id===tempSid&&h.hole_number===hole+1)));
    }

    // -- Step 3: update leaderboard running total state --
    const liveEntry:any={
      summary_id:tempSid,event_id:eid,golfer_id:gid,
      season:selEvent?.season||new Date().getFullYear(),
      entry_type:"Hole-by-Hole",total_stableford_points:runningPts,
      buy_in_paid:true,skins_paid:true,charity_paid:true,
      weekly_payout_won:0,skins_payout_won:0
    };
    setLeaderboard((prev:any)=>[
      ...prev.filter((r:any)=>!(r.event_id===eid&&r.golfer_id===gid)),
      liveEntry
    ]);

    // -- Step 4: flip event to In-Progress --
    setEvents((evs:any)=>evs.map((ev:any)=>
      ev.event_id===eid&&ev.status==="Pairings Set"?{...ev,status:"In-Progress"}:ev
    ));

    // -- Step 5: DB writes -- correct sequence --
    const doHoleWrite=async(realSid:number)=>{
      if(!val||isNaN(grossVal))return;
      const net=calcHoleNetScore(grossVal,phcp,course.hole_stroke_indices[hole]);
      const pts=calcStablefordPoints(net,course.hole_pars[hole]);
      const payload={summary_id:realSid,hole_number:hole+1,gross_score:grossVal,net_score:net,stableford_points:pts};
      await supabase.from("hole_scores").upsert(payload,"summary_id,hole_number");
      // Also update local holeScores with confirmed real sid
      const holeRow={score_id:realSid*100+hole,...payload};
      setHoleScores((hs:any)=>[...hs.filter((h:any)=>!(h.summary_id===realSid&&h.hole_number===hole+1)),holeRow]);
    };

    const doSignupWrite=(realSid:number)=>{
      // Persist tee box + playing HCP on the signup row so auto-restore works
      setSignups((su:any)=>{
        const su2=su.map((s:any)=>
          s.event_id===eid&&s.golfer_id===gid
            ?{...s,tee_box_course_id:parseInt(updatedScorer.courseId),playing_handicap:phcp}
            :s
        );
        const mySu=su2.find((s:any)=>s.event_id===eid&&s.golfer_id===gid);
        if(mySu&&mySu.signup_id&&mySu.signup_id<1e12){
          supabase.from("event_signups").update(
            {tee_box_course_id:parseInt(updatedScorer.courseId),playing_handicap:phcp},
            {signup_id:mySu.signup_id}
          ).catch(()=>{});
        }
        return su2;
      });
    };

    // startScoring() guarantees a real summary_id exists before any hole is entered.
    // So we always take the direct-write path — no inserts, no queuing, no races.
    if(!existing||existing.summary_id>=1e12){
      // Safety fallback: scorer started before DB row was ready — skip write,
      // the hole will be written when state catches up on next keystroke.
      return;
    }
    const realSid=existing.summary_id;
    const {summary_id,created_at,...lbRest}=liveEntry;
    supabase.from("event_leaderboard").update({...lbRest,summary_id:realSid},{summary_id:realSid}).catch(()=>{});
    doHoleWrite(realSid).catch(()=>{});
    doSignupWrite(realSid);
  };

  const handleSubmitAll=()=>{
    let count=0;
    scorers.forEach(scorer=>{
      if(!scorer.golferId||!scorer.courseId)return;
      const gid=parseInt(scorer.golferId);
      const eid=parseInt(selEventId);
      const course=courses.find((c:any)=>c.course_id===parseInt(scorer.courseId));
      const g=golfers.find((x:any)=>x.golfer_id===gid);
      if(!g||!course)return;
      const phcp=calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par);
      const holeCalcs=mode==="hole"?calcHoleScores(scorer.grossScores,phcp,course):[];
      const pts=mode==="total"?parseInt(scorer.totalPts):holeCalcs.reduce((s:number,h:any)=>s+(h.points??0),0);
      if(!pts||pts<0)return;
      const newSummaryId=Date.now()+gid;
      const newEntry={summary_id:newSummaryId,event_id:eid,golfer_id:gid,season:selEvent?.season||2026,entry_type:mode==="hole"?"Hole-by-Hole":"Total Only",total_stableford_points:pts,buy_in_paid:true,skins_paid:mode==="hole",charity_paid:true,weekly_payout_won:0,skins_payout_won:0};
      const alreadyIn=leaderboard.some((r:any)=>r.event_id===eid&&r.golfer_id===gid);
      if(alreadyIn){setLeaderboard((p:any)=>p.map((r:any)=>r.event_id===eid&&r.golfer_id===gid?newEntry:r));}
      else{setLeaderboard((p:any)=>[...p,newEntry]);}
      if(mode==="hole"){
        const newScores=scorer.grossScores.map((gv:string,i:number)=>{
          if(!gv)return null;
          const net=calcHoleNetScore(parseInt(gv),phcp,course.hole_stroke_indices[i]);
          const p2=calcStablefordPoints(net,course.hole_pars[i]);
          return{score_id:Date.now()+gid+i,summary_id:newSummaryId,hole_number:i+1,gross_score:parseInt(gv),net_score:net,stableford_points:p2};
        }).filter(Boolean);
        setHoleScores((p:any)=>[...p,...newScores]);
      }
      count++;
    });
    if(count>0){showSuccess(`${count} score${count>1?"s":""} submitted`);setScorers([emptyScorer()]);}
  };

  const canSubmit=scorers.some(s=>s.golferId&&s.courseId&&(mode==="total"?!!s.totalPts:s.grossScores.some((v:string)=>!!v)));

  return(
    <div>
      <div className="section-title">Score Entry</div>
      <div className="section-sub">Enter scores for today's round</div>

      <div className="toggle-group">
        <button className={`toggle-btn${mode==="hole"?" active":""}`} onClick={()=>setMode("hole")}>Hole by Hole</button>
        <button className={`toggle-btn${mode==="total"?" active":""}`} onClick={()=>setMode("total")}>Total Only</button>
      </div>

      <div className="form-group">
        <label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value);setScorers([emptyScorer()]);}}>
          <option value="">Select event…</option>
          {activeEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
        </select>
      </div>

      {/* Skins warning */}
      {/* Resume banner -- shown when a prior H×H session is restored */}
      {selEventId&&mode==="hole"&&scorers.some((s:any)=>s.grossScores.some((v:string)=>!!v))&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--green-50)",border:"1.5px solid var(--green-200)",borderRadius:"var(--radius-md)",marginBottom:12}}>
          <span style={{fontSize:18}}>↩</span>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"var(--green-800)"}}>Session restored</div>
            <div style={{fontSize:12,color:"var(--green-700)"}}>Scores from your last session have been reloaded. Continue entering from where you left off.</div>
          </div>
        </div>
      )}

      {selEvent&&hasMixedEntry&&mode==="total"&&(
        <div className="skins-warning"><span>⚠</span><span>This event already has hole-by-hole entries. Submitting total-only scores will prevent skins from being calculated.</span></div>
      )}

      {/* Add Another Golfer — above cards */}
      {selEvent&&scorers.length<4&&(
        <button className="btn btn-outline btn-full" style={{marginBottom:10}} onClick={addScorer}>+ Add Another Golfer ({scorers.length}/4)</button>
      )}

      {/* Scorer setup cards */}
      {selEvent&&scorers.map((scorer,idx)=>{
        const g=golfers.find((x:any)=>x.golfer_id===parseInt(scorer.golferId));
        const course=courses.find((c:any)=>c.course_id===parseInt(scorer.courseId));
        const phcp=g&&course?calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par):null;
        const holeCalcs=g&&course&&mode==="hole"?calcHoleScores(scorer.grossScores,phcp??0,course):[];
        const calcTotal=holeCalcs.reduce((s:number,h:any)=>s+(h.points??0),0);
        const alreadyIn=selEvent&&scorer.golferId?leaderboard.some((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===parseInt(scorer.golferId)):false;

        const isResuming=mode==="hole"&&scorer.golferId&&scorer.grossScores.some((v:string)=>!!v)&&
          selEvent&&leaderboard.some((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===parseInt(scorer.golferId)&&r.entry_type==="Hole-by-Hole");
        const holesIn=scorer.grossScores.filter((v:string)=>!!v).length;

        return(
          <div key={idx} className={`scorer-card${scorer.golferId?" active-scorer":""}`}>
            <div className="scorer-header">
              <span className="scorer-num">Golfer {idx+1}</span>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {isResuming&&<span style={{fontSize:11,fontWeight:700,background:"var(--gold-100)",color:"var(--gold-800)",border:"1px solid var(--gold-300)",borderRadius:12,padding:"2px 9px",letterSpacing:"0.04em"}}>↩ Resuming · {holesIn}/18</span>}
                {idx>0&&<button className="btn btn-sm btn-danger" onClick={()=>removeScorer(idx)}>Remove</button>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Golfer</label>
                <select className="form-select" value={scorer.golferId} onChange={e=>updateScorer(idx,"golferId",e.target.value)}>
                  <option value="">Select…</option>
                  {golfers.filter((g:any)=>g.status==="Active").map((g:any)=><option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}{g.is_guest?" (G)":""}</option>)}
                </select>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Tee Box</label>
                <select className="form-select" value={scorer.courseId} onChange={e=>updateScorer(idx,"courseId",e.target.value)}>
                  <option value="">Select…</option>
                  {availableTees.map((t:any)=><option key={t.course_id} value={t.course_id}>{t.tee_box_name}</option>)}
                </select>
              </div>
            </div>
            {g&&course&&(
              <div style={{marginTop:8,fontSize:13,display:"flex",gap:12,alignItems:"center"}}>
                <span style={{color:"var(--text-muted)"}}>Playing HCP:</span>
                <span style={{fontWeight:700,fontSize:17,color:"var(--green-700)"}}>{phcp}</span>
                {alreadyIn&&<span style={{color:"var(--gold-700)",fontSize:12}}>⚠ Will overwrite</span>}
              </div>
            )}
            {g&&course&&mode==="hole"&&scorer.started&&(
              <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:700,background:"var(--green-100)",color:"var(--green-800)",borderRadius:12,padding:"3px 10px"}}>
                  🟢 Live · Hole by Hole
                </span>
                {isResuming&&<span style={{fontSize:11,fontWeight:700,background:"var(--gold-100)",color:"var(--gold-800)",border:"1px solid var(--gold-300)",borderRadius:12,padding:"2px 9px"}}>↩ Resumed · {holesIn}/18</span>}
              </div>
            )}
            {mode==="total"&&(
              <div className="form-group" style={{marginBottom:0,marginTop:10}}>
                <label className="form-label">Stableford Points</label>
                <input className="form-input" type="number" min="0" max="72" placeholder="e.g. 36" value={scorer.totalPts} onChange={e=>updateScorer(idx,"totalPts",e.target.value)}/>
              </div>
            )}
          </div>
        );
      })}

      {/* Shared Start Scoring button — shown when H×H mode, at least one scorer
           is ready (golfer+tee selected) but not yet started */}
      {mode==="hole"&&selEvent&&scorers.some(s=>s.golferId&&s.courseId&&!s.started)&&(()=>{
        const readyCount=scorers.filter(s=>s.golferId&&s.courseId&&!s.started).length;
        const anyResume=scorers.some(s=>s.golferId&&s.courseId&&!s.started&&
          leaderboard.some((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===parseInt(s.golferId)&&r.entry_type==="Hole-by-Hole"));
        const allResume=scorers.filter(s=>s.golferId&&s.courseId&&!s.started).every(s=>
          leaderboard.some((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===parseInt(s.golferId)&&r.entry_type==="Hole-by-Hole"));
        const label=allResume?"↩ Resume Scoring":anyResume?"▶ Start / Resume Scoring":"▶ Start Scoring";
        const sub=readyCount>1?` (${readyCount} golfers)`:"";
        return(
          <button
            className="btn btn-primary btn-full"
            style={{marginTop:4,marginBottom:8,fontWeight:700,fontSize:16,padding:"15px"}}
            onClick={async()=>{
              for(let i=0;i<scorers.length;i++){
                if(scorers[i].golferId&&scorers[i].courseId&&!scorers[i].started)
                  await startScoring(i);
              }
            }}
          >
            {label}{sub}
          </button>
        );
      })()}

      {/* 3: Unified stacked H×H table -- one row per hole, one column per golfer */}
      {mode==="hole"&&selEvent&&scorers.some(s=>s.golferId&&s.courseId&&s.started)&&(()=>{
        const activeScorersFull=scorers
          .map((s,origIdx)=>({...s,origIdx}))
          .filter(s=>s.golferId&&s.courseId)
          .map(s=>{
            const g=golfers.find((x:any)=>x.golfer_id===parseInt(s.golferId));
            const course=courses.find((c:any)=>c.course_id===parseInt(s.courseId));
            const phcp=g&&course?calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par):0;
            const holeCalcs=g&&course?calcHoleScores(s.grossScores,phcp,course):[];
            return{...s,g,course,phcp,holeCalcs};
          });
        if(!activeScorersFull.length)return null;
        const refCourse=activeScorersFull[0].course;
        const ptsClass=(pts:number|null)=>{if(pts===null||pts===undefined)return"";if(pts>=4)return"pts-eagle";if(pts===3)return"pts-birdie";if(pts===2)return"pts-par";if(pts===1)return"pts-bogey";return"pts-zero";};
        return(
          <div style={{marginTop:8}}>
            <div className="card-title" style={{marginBottom:8}}>Score Sheet</div>
            <div className="score-grid">
              <table className="score-table" style={{minWidth:`${120+activeScorersFull.length*68}px`}}>
                <thead>
                  <tr>
                    <th style={{width:36}}>Hole</th>
                    <th style={{width:32}}>Par</th>
                    {activeScorersFull.map((s,i)=>(
                      <th key={i} style={{minWidth:64}}>
                        {s.g?.first_name||`P${i+1}`}
                        <div style={{fontSize:10,fontWeight:400,opacity:0.8}}>{s.course?.tee_box_name} · {s.phcp}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({length:18},(_,holeIdx)=>(
                    <tr key={holeIdx} style={holeIdx===8?{borderBottom:"3px solid var(--green-600)"}:{}}>
                      <td style={{fontWeight:600}}>{holeIdx+1}</td>
                      <td>{refCourse?.hole_pars[holeIdx]}</td>
                      {activeScorersFull.map((s,si)=>{
                        const h=s.holeCalcs[holeIdx]||{} as {points?:number|null};
                        const pts=h.points;
                        return(
                          <td key={si} className={`score-input-cell ${ptsClass(pts)}`} style={{padding:"3px 2px"}}>
                            <input
                              type="number" min="1" max="15"
                              inputMode="numeric"
                              value={s.grossScores[holeIdx]}
                              onChange={e=>updateGross(s.origIdx,holeIdx,e.target.value)}
                              style={{width:44,MozAppearance:"textfield"}}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr style={{background:"var(--green-50)"}}>
                    <td colSpan={2} style={{fontWeight:700,textAlign:"left",paddingLeft:6,fontSize:13,textTransform:"uppercase"}}>Total</td>
                    {activeScorersFull.map((s,si)=>{
                      const total=s.holeCalcs.reduce((sum:number,h:any)=>sum+(h.points??0),0);
                      return<td key={si} style={{textAlign:"center",fontWeight:700,fontSize:16,color:"var(--green-700)"}}>{total||""}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <button className="btn btn-primary btn-full" disabled={!selEventId||!canSubmit} onClick={handleSubmitAll} style={{marginTop:4}}>
        Submit {scorers.filter(s=>s.golferId&&s.courseId).length>1?`${scorers.filter(s=>s.golferId&&s.courseId).length} Scores`:"Score"}
      </button>

      {/* Finalize Event — shown once the event is In-Progress and has scored entries */}
      {selEvent&&(selEvent.status==="In-Progress"||selEvent.status==="Pairings Set")&&
       leaderboard.filter((r:any)=>r.event_id===selEvent.event_id).length>0&&(
        <div style={{marginTop:24,borderTop:"2px solid var(--border)",paddingTop:18}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Finalize Event</div>
          <p style={{fontSize:14,color:"var(--text-secondary)",marginBottom:14,lineHeight:1.5}}>
            All scores entered? Mark this event <strong>Completed</strong> to lock it in, calculate payouts, and move it off the active scoring list.
            <br/><span style={{fontSize:13,color:"var(--text-muted)"}}>{leaderboard.filter((r:any)=>r.event_id===selEvent.event_id).length} score{leaderboard.filter((r:any)=>r.event_id===selEvent.event_id).length!==1?"s":""} recorded.</span>
          </p>
          <button
            className="btn btn-full"
            style={{background:"var(--green-800)",color:"white",fontWeight:700,fontSize:16,padding:"14px",borderRadius:"var(--radius-md)",border:"none",cursor:"pointer",letterSpacing:"0.02em"}}
            onClick={()=>{
              if(!window.confirm("Finalize \""+formatDate(selEvent.date)+" - "+selEvent.course_name+"\"? This marks it Completed and locks scoring."))return;
              setEvents((p:any)=>p.map((e:any)=>e.event_id===selEvent.event_id?{...e,status:"Completed"}:e));
              setScoreEventId("");
              setScorers([emptyScorer()]);
              showSuccess("Event finalized and marked Completed!");
            }}
          >
            ✓ Finalize Event
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ADMIN TAB
// ============================================================
function AdminTab({golfers,setGolfers,courses,setCourses,events,setEvents,signups,setSignups,leaderboard,setLeaderboard,holeScores,setHoleScores,charityDonations,setCharityDonations,showSuccess}:any){
  const [subTab,setSubTab]=useState("events");
  return(
    <div>
      <div className="section-title">Admin</div>
      <div className="section-sub">League management tools</div>
      <div className="tab-sub">
        {[
          {id:"events",label:"Events"},
          {id:"pairings",label:"Pairings"},
          {id:"hcp",label:"Handicaps"},
          {id:"coursehcp",label:"Course HCPs"},
          {id:"scores",label:"Scores"},
          {id:"payouts",label:"Payouts"},
          {id:"courses",label:"Courses"},
          {id:"roster",label:"Roster"},
        ].map(t=>(
          <button key={t.id} className={`tab-sub-btn${subTab===t.id?" active":""}`} onClick={()=>setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {subTab==="events"&&<EventCreator courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} golfers={golfers} showSuccess={showSuccess}/>}
      {subTab==="pairings"&&<PairingDashboard golfers={golfers} courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} showSuccess={showSuccess}/>}
      {subTab==="hcp"&&<HandicapManager golfers={golfers} setGolfers={setGolfers} showSuccess={showSuccess}/>}
      {subTab==="coursehcp"&&<CourseHcpSheet golfers={golfers} courses={courses} showSuccess={showSuccess}/>}
      {subTab==="scores"&&<ScoreCorrection golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} setLeaderboard={setLeaderboard} holeScores={holeScores} setHoleScores={setHoleScores} showSuccess={showSuccess}/>}
      {subTab==="payouts"&&<FinanceView golfers={golfers} leaderboard={leaderboard} events={[...events].filter((e:any)=>e.status==="Completed").sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime())} charityDonations={charityDonations} setCharityDonations={setCharityDonations} showSuccess={showSuccess}/>}
      {subTab==="courses"&&<CourseManager courses={courses} setCourses={setCourses} showSuccess={showSuccess}/>}
      {subTab==="roster"&&<GolferRoster golfers={golfers} setGolfers={setGolfers} showSuccess={showSuccess}/>}
    </div>
  );
}

// -- 3a) GOLFER ROSTER ----------------------------------------
function GolferRoster({golfers,setGolfers,showSuccess}:any){
  const blank={first_name:"",last_name:"",email_address:"",current_handicap_index:"18",season_fee_paid:false};
  const [form,setForm]=useState<any>(blank);
  const [editId,setEditId]=useState<number|null>(null);

  const members=golfers.filter((g:any)=>!g.is_guest);

  const save=()=>{
    if(!form.first_name.trim()||!form.last_name.trim())return;
    if(editId!==null){
      setGolfers((p:any)=>p.map((g:any)=>g.golfer_id===editId?{...g,...form,current_handicap_index:parseFloat(form.current_handicap_index)||18}:g));
      showSuccess(`${form.first_name} ${form.last_name} updated`);
    }else{
      const newId=Date.now();
      setGolfers((p:any)=>[...p,{golfer_id:newId,first_name:form.first_name.trim(),last_name:form.last_name.trim(),email_address:form.email_address.trim(),current_handicap_index:parseFloat(form.current_handicap_index)||18,is_guest:false,status:"Active",season_fee_paid:form.season_fee_paid}]);
      showSuccess(`${form.first_name} ${form.last_name} added`);
    }
    setForm(blank); setEditId(null);
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };

  const startEdit=(g:any)=>{
    setEditId(g.golfer_id);
    setForm({first_name:g.first_name,last_name:g.last_name,email_address:g.email_address||"",current_handicap_index:String(g.current_handicap_index),season_fee_paid:!!g.season_fee_paid});
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };

  const toggleStatus=(id:number,cur:string)=>{
    setGolfers((p:any)=>p.map((g:any)=>g.golfer_id===id?{...g,status:cur==="Active"?"Inactive":"Active"}:g));
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };
  const toggleFee=(id:number)=>{
    setGolfers((p:any)=>p.map((g:any)=>g.golfer_id===id?{...g,season_fee_paid:!g.season_fee_paid}:g));
    showSuccess("Fee status updated");
  };

  return(
    <div>
      <div className="card-title" style={{marginBottom:12}}>{editId?"Edit Golfer":"Add New Golfer"}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div className="form-group" style={{marginBottom:0}}><label className="form-label">First Name</label><input className="form-input" value={form.first_name} onChange={e=>setForm((p:any)=>({...p,first_name:e.target.value}))}/></div>
        <div className="form-group" style={{marginBottom:0}}><label className="form-label">Last Name</label><input className="form-input" value={form.last_name} onChange={e=>setForm((p:any)=>({...p,last_name:e.target.value}))}/></div>
      </div>
      <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email_address} onChange={e=>setForm((p:any)=>({...p,email_address:e.target.value}))}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div className="form-group" style={{marginBottom:0}}><label className="form-label">HCP Index</label><input className="form-input" type="number" step="0.1" min="0" max="54" value={form.current_handicap_index} onChange={e=>setForm((p:any)=>({...p,current_handicap_index:e.target.value}))}/></div>
        <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <label className="form-label">Season Fee ($300)</label>
          <button className={`btn btn-sm${form.season_fee_paid?" btn-primary":" btn-outline"}`} style={{width:"100%"}} onClick={()=>setForm((p:any)=>({...p,season_fee_paid:!p.season_fee_paid}))}>{form.season_fee_paid?"✓ Paid":"Unpaid"}</button>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={!form.first_name.trim()||!form.last_name.trim()}>{editId?"Save Changes":"Add Golfer"}</button>
        {editId&&<button className="btn btn-outline" onClick={()=>{setEditId(null);setForm(blank);}}>Cancel</button>}
      </div>

      <div className="card-title" style={{marginBottom:8}}>Members</div>
      {members.map((g:any)=>(
        <div key={g.golfer_id} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:15}}>{g.first_name} {g.last_name}{g.status==="Inactive"&&<span className="pill pill-red" style={{fontSize:10,marginLeft:6}}>Inactive</span>}</div>
            <div style={{fontSize:12,color:"var(--text-muted)"}}>HCP {g.current_handicap_index?.toFixed(1)} · {g.email_address||"no email"}</div>
          </div>
          <button title="Toggle $300 fee" onClick={()=>toggleFee(g.golfer_id)} className={`btn btn-sm${g.season_fee_paid?" btn-primary":" btn-outline"}`}>{g.season_fee_paid?"$✓":"$?"}</button>
          <button className="btn btn-sm btn-outline" onClick={()=>startEdit(g)}>Edit</button>
          <button className={`btn btn-sm${g.status==="Active"?" btn-danger":" btn-primary"}`} onClick={()=>toggleStatus(g.golfer_id,g.status)}>{g.status==="Active"?"Deactivate":"Activate"}</button>
        </div>
      ))}
    </div>
  );
}

// -- 3b) COURSE MANAGER ---------------------------------------
function CourseManager({courses,setCourses,showSuccess}:any){
  const editFormRef=useRef<HTMLDivElement>(null);
  const blank:any={course_id:0,course_name:"",tee_box_name:"",tee_slope:113,tee_rating:72.0,par:72};
  const [editing,setEditing]=useState<any|null>(null);
  const [form,setForm]=useState<any>(blank);
  const [parStr,setParStr]=useState("4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,4");
  const [siStr,setSiStr]=useState("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18");
  const courseNames=[...new Set(courses.map((c:any)=>c.course_name))] as string[];

  const startNew=()=>{setEditing("new");setForm(blank);setParStr("4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,4");setSiStr("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18");setTimeout(()=>editFormRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),50);};
  const startEdit=(c:any)=>{setEditing(c.course_id);setForm({...c});setParStr(c.hole_pars.join(","));setSiStr(c.hole_stroke_indices.join(","));setTimeout(()=>editFormRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),50);};

  const save=()=>{
    const pars=parStr.split(",").map(v=>parseInt(v.trim())).filter(v=>!isNaN(v));
    const sis=siStr.split(",").map(v=>parseInt(v.trim())).filter(v=>!isNaN(v));
    if(pars.length!==18||sis.length!==18){showSuccess("⚠ Must have exactly 18 values for par and stroke index");return;}
    const entry={...form,tee_slope:parseInt(form.tee_slope)||113,tee_rating:parseFloat(form.tee_rating)||72.0,par:parseInt(form.par)||72,hole_pars:pars,hole_stroke_indices:sis};
    if(editing==="new"){
      const newId=Date.now();
      setCourses((p:any)=>[...p,{...entry,course_id:newId}]);
      showSuccess(`${entry.tee_box_name} tee added to ${entry.course_name}`);
    }else{
      setCourses((p:any)=>p.map((c:any)=>c.course_id===editing?{...entry,course_id:editing}:c));
      showSuccess(`${entry.course_name} (${entry.tee_box_name}) updated`);
    }
    setEditing(null);
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div className="card-title">Course & Tee Manager</div>
        <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add Tee</button>
      </div>

      {editing&&(
        <div ref={editFormRef} className="card" style={{marginBottom:14}}>
          <div className="card-title" style={{marginBottom:10}}>{editing==="new"?"New Tee Box":"Edit Tee Box"}</div>
          <div className="form-group">
            <label className="form-label">Course Name</label>
            <input className="form-input" list="cname-list" value={form.course_name} onChange={e=>setForm((p:any)=>({...p,course_name:e.target.value}))} placeholder="e.g. Strawberry Farms GC"/>
            <datalist id="cname-list">{courseNames.map(n=><option key={n} value={n}/>)}</datalist>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Tee Name</label><input className="form-input" value={form.tee_box_name} onChange={e=>setForm((p:any)=>({...p,tee_box_name:e.target.value}))}/></div>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Par</label><input className="form-input" type="number" value={form.par} onChange={e=>setForm((p:any)=>({...p,par:e.target.value}))}/></div>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Slope</label><input className="form-input" type="number" value={form.tee_slope} onChange={e=>setForm((p:any)=>({...p,tee_slope:e.target.value}))}/></div>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Rating</label><input className="form-input" type="number" step="0.1" value={form.tee_rating} onChange={e=>setForm((p:any)=>({...p,tee_rating:e.target.value}))}/></div>
          </div>
          <div className="form-group" style={{marginTop:8}}><label className="form-label">Hole Pars (18, comma-separated)</label><input className="form-input" value={parStr} onChange={e=>setParStr(e.target.value)} placeholder="4,4,3,5,…"/></div>
          <div className="form-group"><label className="form-label">Stroke Indices (18, comma-separated)</label><input className="form-input" value={siStr} onChange={e=>setSiStr(e.target.value)} placeholder="1,2,3,…"/></div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={save}>Save</button>
            <button className="btn btn-outline" onClick={()=>setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {courseNames.map(name=>(
        <div key={name} className="card" style={{padding:"12px 14px"}}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>{name}</div>
          {courses.filter((c:any)=>c.course_name===name).map((c:any)=>(
            <div key={c.course_id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid var(--border)"}}>
              <div style={{flex:1}}>
                <span style={{fontWeight:600}}>{c.tee_box_name}</span>
                <span style={{fontSize:13,color:"var(--text-muted)",marginLeft:8}}>Sl {c.tee_slope} · Rt {c.tee_rating} · Par {c.par}</span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={()=>startEdit(c)}>Edit</button>
              <button className="btn btn-sm btn-danger" onClick={()=>{setCourses((p:any)=>p.filter((x:any)=>x.course_id!==c.course_id));showSuccess("Tee removed");setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);}}>Del</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ScoreCorrection({golfers,courses,events,leaderboard,setLeaderboard,holeScores,setHoleScores,showSuccess}:any){
  const [selEventId,setSelEventId]=useState("");
  const [selGolferId,setSelGolferId]=useState("");
  const [corrType,setCorrType]=useState("total");
  const [corrPts,setCorrPts]=useState("");
  const [corrCourseId,setCorrCourseId]=useState("");
  const [corrGross,setCorrGross]=useState<string[]>(Array(18).fill(""));

  // 2b: year filter
  const allSeasonsList=[...new Set(events.map((e:any)=>e.season))].sort((a:any,b:any)=>b-a) as number[];
  const [filterYear,setFilterYear]=useState<number>(allSeasonsList[0]||new Date().getFullYear());
  const filteredEvents=[...events].filter((e:any)=>e.season===filterYear).sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());

  const selEvent=events.find((e:any)=>e.event_id===parseInt(selEventId));
  const entry=leaderboard.find((r:any)=>r.event_id===parseInt(selEventId)&&r.golfer_id===parseInt(selGolferId));
  const existingHbh=entry?.entry_type==="Hole-by-Hole"?holeScores.filter((hs:any)=>hs.summary_id===entry.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number):[];
  const availTees=selEvent?courses.filter((c:any)=>c.course_name===selEvent.course_name):[];
  const corrCourse=courses.find((c:any)=>c.course_id===parseInt(corrCourseId));
  const corrGolfer=golfers.find((g:any)=>g.golfer_id===parseInt(selGolferId));
  const corrPhcp=corrGolfer&&corrCourse?calcPlayingHandicap(corrGolfer.current_handicap_index,corrCourse.tee_slope,corrCourse.tee_rating,corrCourse.par):null;
  const holeCalcs=corrCourse&&corrType==="hole"&&corrPhcp!=null?calcHoleScores(corrGross,corrPhcp,corrCourse):[];
  const calcTotal=holeCalcs.reduce((s:number,h:any)=>s+(h.points??0),0);

  useEffect(()=>{
    if(!entry)return;
    setCorrType(entry.entry_type==="Hole-by-Hole"?"hole":"total");
    setCorrPts(String(entry.total_stableford_points));
    if(existingHbh.length>0){
      const arr=Array(18).fill("");
      existingHbh.forEach((hs:any)=>{arr[hs.hole_number-1]=String(hs.gross_score);});
      setCorrGross(arr);
    }else{setCorrGross(Array(18).fill(""));}
  },[selEventId,selGolferId]);

  const saveCorrection=()=>{
    if(!entry)return;
    const pts=corrType==="hole"?calcTotal:parseInt(corrPts);
    if(!pts)return;
    const updated={...entry,total_stableford_points:pts,entry_type:corrType==="hole"?"Hole-by-Hole":"Total Only",skins_paid:corrType==="hole"};
    setLeaderboard((p:any)=>p.map((r:any)=>r.summary_id===entry.summary_id?updated:r));
    if(corrType==="hole"&&corrCourse&&corrPhcp!=null){
      setHoleScores((p:any)=>{
        const without=p.filter((hs:any)=>hs.summary_id!==entry.summary_id);
        const newScores=corrGross.map((v:string,i:number)=>{
          if(!v)return null;
          const net=calcHoleNetScore(parseInt(v),corrPhcp,corrCourse.hole_stroke_indices[i]);
          return{score_id:Date.now()+i,summary_id:entry.summary_id,hole_number:i+1,gross_score:parseInt(v),net_score:net,stableford_points:calcStablefordPoints(net,corrCourse.hole_pars[i])};
        }).filter(Boolean);
        return[...without,...newScores];
      });
    }
    showSuccess(`Score corrected: ${golferName(golfers,parseInt(selGolferId))} -> ${pts} pts`);
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };

  const deleteEntry=()=>{
    if(!entry)return;
    setLeaderboard((p:any)=>p.filter((r:any)=>r.summary_id!==entry.summary_id));
    setHoleScores((p:any)=>p.filter((hs:any)=>hs.summary_id!==entry.summary_id));
    setSelGolferId(""); showSuccess("Score entry deleted");
  };

  const ptsClass=(pts:number|null)=>{if(pts===null||pts===undefined)return"";if(pts>=4)return"pts-eagle";if(pts===3)return"pts-birdie";if(pts===2)return"pts-par";if(pts===1)return"pts-bogey";return"pts-zero";};

  return(
    <div>
      <div className="card-title" style={{marginBottom:8}}>Score Correction</div>
      <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:14}}>Select an event and golfer to correct their score. Only the current season is editable.</p>

      {/* 2b: Year filter -- only current year is editable */}
      <div className="form-group">
        <label className="form-label">Season</label>
        <select className="form-select" value={filterYear} onChange={e=>{setFilterYear(parseInt(e.target.value));setSelEventId("");setSelGolferId("");}}>
          {allSeasonsList.map(y=><option key={y} value={y}>{y} Season{y!==allSeasonsList[0]?" (view only)":""}</option>)}
        </select>
      </div>
      {filterYear!==allSeasonsList[0]&&(
        <div style={{background:"var(--gold-50)",border:"1.5px solid var(--gold-300)",borderRadius:"var(--radius-md)",padding:"10px 14px",fontSize:13,color:"var(--gold-800)",marginBottom:12}}>
          ⚠ Past seasons are read-only. Switch to the current season to make edits.
        </div>
      )}

      <div className="form-group"><label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value);setSelGolferId("");}}>
          <option value="">Select event…</option>
          {filteredEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
        </select>
      </div>
      {selEventId&&(
        <div className="form-group"><label className="form-label">Golfer</label>
          <select className="form-select" value={selGolferId} onChange={e=>setSelGolferId(e.target.value)}>
            <option value="">Select golfer…</option>
            {leaderboard.filter((r:any)=>r.event_id===parseInt(selEventId)).map((r:any)=>{
              const g=golfers.find((x:any)=>x.golfer_id===r.golfer_id);
              return<option key={r.golfer_id} value={r.golfer_id}>{g?`${g.first_name} ${g.last_name}`:"Unknown"} -- {r.total_stableford_points} pts ({r.entry_type})</option>;
            })}
          </select>
        </div>
      )}
      {entry&&(
        <>
          <div className="card" style={{padding:"10px 14px",marginBottom:12}}>
            <div className="info-row"><span className="info-key">Current Score</span><span className="info-val" style={{fontWeight:700,fontSize:18,color:"var(--green-700)"}}>{entry.total_stableford_points} pts</span></div>
            <div className="info-row"><span className="info-key">Entry Type</span><span className="info-val">{entry.entry_type}</span></div>
          </div>
          <div className="toggle-group" style={{marginBottom:12}}>
            <button className={`toggle-btn${corrType==="total"?" active":""}`} onClick={()=>setCorrType("total")}>Total Only</button>
            <button className={`toggle-btn${corrType==="hole"?" active":""}`} onClick={()=>setCorrType("hole")}>Hole by Hole</button>
          </div>
          {corrType==="hole"&&(
            <div className="form-group"><label className="form-label">Tee Box (for recalc)</label>
              <select className="form-select" value={corrCourseId} onChange={e=>setCorrCourseId(e.target.value)}>
                <option value="">Select tee…</option>
                {availTees.map((t:any)=><option key={t.course_id} value={t.course_id}>{t.tee_box_name} -- Slope {t.tee_slope}</option>)}
              </select>
            </div>
          )}
          {corrType==="total"?(
            <div className="form-group"><label className="form-label">Corrected Points</label><input className="form-input" type="number" min="0" max="72" value={corrPts} onChange={e=>setCorrPts(e.target.value)}/></div>
          ):(corrCourse&&(
            <div className="score-grid" style={{marginBottom:12}}>
              <table className="score-table">
                <thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>Gross</th><th>Pts</th></tr></thead>
                <tbody>
                  {Array.from({length:18},(_,i)=>{
                    const h=holeCalcs[i]||{} as {points?:number|null};
                    return(<tr key={i}>
                      <td style={{fontWeight:600}}>{i+1}</td>
                      <td>{corrCourse.hole_pars[i]}</td>
                      <td style={{color:"var(--text-muted)"}}>{corrCourse.hole_stroke_indices[i]}</td>
                      <td className="score-input-cell"><input type="number" min="1" max="15" inputMode="numeric" value={corrGross[i]} onChange={e=>{const v=[...corrGross];v[i]=e.target.value;setCorrGross(v);}}/></td>
                      <td className={ptsClass(h.points)} style={{fontWeight:h.points!=null?700:400}}>{h.points!=null?h.points:""}</td>
                    </tr>);
                  })}
                  <tr style={{background:"var(--green-50)"}}><td colSpan={3} style={{fontWeight:700,textAlign:"left",paddingLeft:8,fontSize:13}}>Total Pts</td><td/><td style={{fontWeight:700,fontSize:16,color:"var(--green-700)"}}>{calcTotal||""}</td></tr>
                </tbody>
              </table>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={saveCorrection} disabled={filterYear!==allSeasonsList[0]}>Save Correction</button>
            <button className="btn btn-danger" onClick={deleteEntry} disabled={filterYear!==allSeasonsList[0]}>Delete</button>
          </div>
        </>
      )}
    </div>
  );
}

function HandicapManager({golfers,setGolfers,showSuccess}:any){
  const [edits,setEdits]=useState<Record<number,string>>({});
  const [showInactive,setShowInactive]=useState(false);
  const handleSave=()=>{setGolfers((p:any)=>p.map((g:any)=>edits[g.golfer_id]!==undefined?{...g,current_handicap_index:parseFloat(edits[g.golfer_id])||g.current_handicap_index}:g));setEdits({});showSuccess("Handicap indices updated");setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);};
  return(
    <div>
      <div className="card-title" style={{marginBottom:4}}>Weekly Handicap Update</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:14}}>Edit handicap indices. Press Save when done.</p>
      <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",marginBottom:16}}>
        {golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any,i:number,arr:any[])=>(
          <div key={g.golfer_id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",borderBottom:i<arr.length-1?"1.5px solid var(--border-md)":"none",background:i%2===0?"var(--surface)":"var(--surface2)"}}>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text-primary)"}}>{g.first_name} {g.last_name}</div>
            <input type="number" step="0.1" min="0" max="54" style={{width:80,padding:"8px 10px",border:"1.5px solid var(--border-md)",borderRadius:"var(--radius-md)",fontFamily:"DM Sans,sans-serif",fontSize:16,textAlign:"center",fontWeight:700}} value={edits[g.golfer_id]!==undefined?edits[g.golfer_id]:g.current_handicap_index} onChange={e=>setEdits(p=>({...p,[g.golfer_id]:e.target.value}))}/>
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-full" onClick={handleSave} disabled={Object.keys(edits).length===0}>Save Handicaps {Object.keys(edits).length>0?`(${Object.keys(edits).length} changed)`:""}</button>

      {/* Inactive & Guest golfers */}
      <div style={{marginTop:20,borderTop:"2px solid var(--border)",paddingTop:16}}>
        <button className="btn btn-outline btn-full" style={{marginBottom:showInactive?12:0}} onClick={()=>setShowInactive(v=>!v)}>
          {showInactive?"▲ Hide":"▼ Show"} Inactive &amp; Guest Golfers
        </button>
        {showInactive&&(
          <div>
            {golfers.filter((g:any)=>g.status==="Inactive"||g.is_guest).length===0?(
              <div style={{fontSize:13,color:"var(--text-muted)",padding:"8px 0"}}>No inactive or guest golfers.</div>
            ):(
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",marginBottom:12}}>
                {golfers.filter((g:any)=>g.status==="Inactive"||g.is_guest).map((g:any,i:number,arr:any[])=>(
                  <div key={g.golfer_id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",borderBottom:i<arr.length-1?"1.5px solid var(--border-md)":"none",background:i%2===0?"var(--surface)":"var(--surface2)"}}>
                    <div>
                      <div style={{fontSize:16,fontWeight:600,color:"var(--text-primary)"}}>{g.first_name} {g.last_name}</div>
                      <div style={{fontSize:11,color:"var(--text-muted)",marginTop:1}}>{g.is_guest?"Guest":g.status}</div>
                    </div>
                    <input type="number" step="0.1" min="0" max="54"
                      style={{width:80,padding:"8px 10px",border:"1.5px solid var(--border-md)",borderRadius:"var(--radius-md)",fontFamily:"DM Sans,sans-serif",fontSize:16,textAlign:"center",fontWeight:700}}
                      value={edits[g.golfer_id]!==undefined?edits[g.golfer_id]:g.current_handicap_index}
                      onChange={e=>setEdits((p:any)=>({...p,[g.golfer_id]:e.target.value}))}/>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-primary btn-full" onClick={handleSave} style={{marginTop:10}}>Save All Changes</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CourseHcpSheet({golfers,courses,showSuccess}:any){
  const courseNames=uniqueCourseNames(courses);
  const [selCourseName,setSelCourseName]=useState(courseNames[0]||"");
  const [showModal,setShowModal]=useState(false);
  const [copied,setCopied]=useState(false);
  const tees=teeBoxesForCourse(courses,selCourseName);
  const members=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").sort((a:any,b:any)=>a.first_name.localeCompare(b.first_name));

  // Build a rich HTML table suitable for pasting into Gmail / Outlook
  const buildHtmlTable=()=>{
    const thStyle="padding:8px 14px;text-align:center;background:#1a4a28;color:#f5d97a;font-size:14px;font-weight:700;";
    const tdNameStyle="padding:8px 14px;font-size:14px;border-bottom:1px solid #e0d4c4;white-space:nowrap;";
    const tdHcpStyle="padding:2px 0;font-size:11px;color:#888;";
    const tdValStyle="padding:8px 14px;text-align:center;font-size:16px;font-weight:700;color:#1a6b3a;border-bottom:1px solid #e0d4c4;";
    let rows=members.map((g:any)=>{
      const cells=tees.map((t:any)=>"<td style=\""+tdValStyle+"\">"+calcPlayingHandicap(g.current_handicap_index,t.tee_slope,t.tee_rating,t.par)+"</td>").join("");
      return "<tr><td style=\""+tdNameStyle+"\">"+g.first_name+" "+g.last_name+"<div style=\""+tdHcpStyle+"\">HCP "+g.current_handicap_index.toFixed(1)+"</div></td>"+cells+"</tr>";
    }).join("");
    const headers=tees.map((t:any)=>"<th style=\""+thStyle+"\">"+t.tee_box_name+"<br/><span style=\"font-weight:400;font-size:11px;opacity:0.85;\">Sl "+t.tee_slope+" / Rt "+t.tee_rating+"</span></th>").join("");
    return (
      "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;\">" +
      "<h2 style=\"background:#1a4a28;color:#f5d97a;margin:0;padding:14px 18px;font-size:18px;\">⛳ Saturday School</h2>" +
      "<h3 style=\"background:#2d6e45;color:white;margin:0;padding:10px 18px;font-size:15px;font-weight:400;\">Playing Handicaps -- "+selCourseName+"</h3>" +
      "<table style=\"width:100%;border-collapse:collapse;font-family:Arial,sans-serif;\">" +
      "<thead><tr><th style=\""+thStyle+"text-align:left;\">Golfer</th>"+headers+"</tr></thead>" +
      "<tbody>"+rows+"</tbody></table>" +
      "<p style=\"font-size:12px;color:#888;padding:10px 18px;\">Generated by Saturday School App</p></div>"
    );
  };

  const handleCopy=async()=>{
    const html=buildHtmlTable();
    try{
      // Try rich HTML copy first (works in Chrome/Edge, pastes as formatted table)
      await navigator.clipboard.write([
        new ClipboardItem({"text/html":new Blob([html],{type:"text/html"}),"text/plain":new Blob([html],{type:"text/plain"})})
      ]);
      setCopied(true);
      setTimeout(()=>setCopied(false),3000);
    }catch{
      // Fallback: copy plain HTML string
      try{
        await navigator.clipboard.writeText(html);
        setCopied(true);
        setTimeout(()=>setCopied(false),3000);
      }catch{
        showSuccess("Could not access clipboard -- try on a different browser");
      }
    }
  };

  return(
    <div>
      <div className="card-title" style={{marginBottom:8}}>Course Handicap Sheet</div>
      <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:14}}>Playing handicap for every member across all tee boxes.</p>
      <div className="form-group"><label className="form-label">Golf Course</label><select className="form-select" value={selCourseName} onChange={e=>setSelCourseName(e.target.value)}>{courseNames.map(n=><option key={n} value={n}>{n}</option>)}</select></div>
      {tees.length>0&&(
        <>
          <div style={{overflowX:"auto"}}>
            <table className="hcp-table">
              <thead><tr><th>Golfer</th>{tees.map((t:any)=><th key={t.course_id}>{t.tee_box_name}<br/><span style={{fontWeight:400,fontSize:10,opacity:0.8}}>Sl {t.tee_slope} Rt {t.tee_rating}</span></th>)}</tr></thead>
              <tbody>{members.map((g:any)=><tr key={g.golfer_id}><td>{g.first_name} {g.last_name}<br/><span style={{fontSize:12,color:"var(--text-muted)"}}>HCP {g.current_handicap_index.toFixed(1)}</span></td>{tees.map((t:any)=><td key={t.course_id} style={{fontWeight:700,fontSize:18,color:"var(--green-700)"}}>{calcPlayingHandicap(g.current_handicap_index,t.tee_slope,t.tee_rating,t.par)}</td>)}</tr>)}</tbody>
            </table>
          </div>

          {/* Email buttons */}
          <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={()=>setShowModal(true)}>✉ Email Handicaps</button>
          </div>

          {/* Email modal */}
          {showModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:999,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowModal(false)}>
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-lg) var(--radius-lg) 0 0",padding:24,width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:18,fontWeight:700,color:"var(--green-800)",marginBottom:4}}>Email Course Handicaps</div>
                <div style={{fontSize:14,color:"var(--text-muted)",marginBottom:20}}>{selCourseName}</div>

                {/* Step instructions */}
                <div style={{display:"flex",flexDirection:"column",gap:14}}>

                  {/* Step 1: Copy */}
                  <div style={{background:"var(--surface2)",borderRadius:"var(--radius-md)",padding:16,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Step 1 -- Copy the table</div>
                    <p style={{fontSize:14,color:"var(--text-primary)",marginBottom:12,lineHeight:1.5}}>
                      Copies a formatted HTML table to your clipboard. When you paste it into Gmail or Outlook it will look like a proper table with colors.
                    </p>
                    <button className={copied?"btn btn-primary btn-full":"btn btn-outline btn-full"} onClick={handleCopy} style={{fontWeight:700}}>
                      {copied?"✅ Copied to clipboard!":"📋 Copy Formatted Table"}
                    </button>
                  </div>

                  {/* Step 2: Open email */}
                  <div style={{background:"var(--surface2)",borderRadius:"var(--radius-md)",padding:16,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Step 2 -- Compose &amp; paste</div>
                    <p style={{fontSize:14,color:"var(--text-primary)",marginBottom:12,lineHeight:1.5}}>
                      Open your email app, start a new message to the group, then paste (<strong>Ctrl+V</strong> / <strong>⌘V</strong>) into the body. The table will appear with full formatting.
                    </p>
                    <div style={{background:"var(--green-50)",border:"1px solid var(--green-200)",borderRadius:"var(--radius-md)",padding:"10px 12px",fontSize:13,color:"var(--green-800)"}}>
                      <strong>Suggested subject:</strong> Saturday School - Playing Handicaps ({selCourseName})
                    </div>
                  </div>

                  {/* Preview */}
                  <div style={{background:"var(--surface2)",borderRadius:"var(--radius-md)",padding:16,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>Preview</div>
                    <div style={{overflowX:"auto",fontSize:13}} dangerouslySetInnerHTML={{__html:buildHtmlTable()}}/>
                  </div>
                </div>

                <button className="btn btn-outline btn-full" style={{marginTop:18}} onClick={()=>setShowModal(false)}>Close</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EventCreator({courses,events,setEvents,signups,setSignups,golfers,showSuccess}:any){
  const formTopRef=useRef<HTMLDivElement>(null);
  const [date,setDate]=useState("");
  const [courseName,setCourseName]=useState("");
  const [teeTimes,setTeeTimes]=useState("09:10\n09:20\n09:30");
  const [season,setSeason]=useState(new Date().getFullYear());
  const [editId,setEditId]=useState<number|null>(null);
  const courseNames=uniqueCourseNames(courses);

  const resetForm=()=>{setDate("");setCourseName("");setTeeTimes("08:00\n08:10\n08:20\n08:30");setSeason(new Date().getFullYear());setEditId(null);};

  const startEdit=(ev:any)=>{
    setEditId(ev.event_id); setDate(ev.date); setCourseName(ev.course_name);
    setTeeTimes(ev.tee_times.join("\n")); setSeason(ev.season);
    setTimeout(()=>formTopRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),50);
  };

  const handleSave=()=>{
    if(!date||!courseName)return;
    const tts=teeTimes.split("\n").map((t:string)=>t.trim()).filter(Boolean);
    if(editId!==null){
      setEvents((p:any)=>p.map((e:any)=>e.event_id===editId?{...e,date,course_name:courseName,tee_times:tts,season}:e));
      showSuccess(`Event updated: ${formatDate(date)}`);
    }else{
      const newId=Date.now();
      setEvents((p:any)=>[...p,{event_id:newId,season,date,course_name:courseName,tee_times:tts,status:"Upcoming"}]);
      const activeGs=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active");
      setSignups((p:any)=>[...p,...activeGs.map((g:any,i:number)=>({signup_id:Date.now()+i+1,event_id:newId,golfer_id:g.golfer_id,attending:"Unconfirmed",assigned_tee_time:null,tee_box_course_id:null,playing_handicap:null,is_guest_entry:false,sponsor_golfer_id:null}))]);
      showSuccess(`Event created: ${formatDate(date)}`);
    }
    resetForm();
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };

  const deleteEvent=(evId:number,evDate:string)=>{
    if(!window.confirm(`Delete event on ${formatDate(evDate)}? This cannot be undone.`))return;
    setEvents((p:any)=>p.filter((e:any)=>e.event_id!==evId));
    setSignups((p:any)=>p.filter((s:any)=>s.event_id!==evId));
    showSuccess("Event deleted");
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };

  const currentYear=new Date().getFullYear();
  const allSeasonsList=[...new Set(events.map((e:any)=>e.season))].sort((a:any,b:any)=>b-a) as number[];
  const [filterSeason,setFilterSeason]=useState<number|"all">(allSeasonsList[0]||currentYear);
  const sortedEvents=[...events].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);
  const filteredEvents=filterSeason==="all"?sortedEvents:sortedEvents.filter((e:any)=>e.season===filterSeason);

  return(
    <div>
      <div ref={formTopRef} className="card-title" style={{marginBottom:12}}>{editId?"Edit Event":"Create New Event"}</div>
      <div className="form-group"><label className="form-label">Season (Year)</label><input className="form-input" type="number" min="2020" max="2040" value={season} onChange={e=>setSeason(parseInt(e.target.value))}/></div>
      <div className="form-group"><label className="form-label">Date</label>
        <input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{cursor:"pointer"}}/>
        {date&&<div style={{fontSize:12,color:"var(--green-700)",marginTop:4,fontWeight:500}}>📅 {formatDate(date)}</div>}
      </div>
      <div className="form-group"><label className="form-label">Golf Course</label><select className="form-select" value={courseName} onChange={e=>setCourseName(e.target.value)}><option value="">Select course…</option>{courseNames.map(n=><option key={n} value={n}>{n}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Tee Times (one per line)</label><textarea className="form-input" rows={4} value={teeTimes} onChange={e=>setTeeTimes(e.target.value)} style={{resize:"vertical"}}/></div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button className="btn btn-primary" style={{flex:1}} onClick={handleSave} disabled={!date||!courseName}>{editId?"Save Changes":"Create Event"}</button>
        {editId&&<button className="btn btn-outline" onClick={resetForm}>Cancel</button>}
      </div>
      <hr className="divider"/>
      <div className="card-title" style={{marginBottom:8}}>Invitation Email</div>
      <a href={`mailto:?cc=${allEmails.join(",")}&subject=Saturday School - Upcoming Round&body=Hi all, join us for our next Saturday round. Please RSVP on the app!`} className="btn btn-outline btn-full" style={{textDecoration:"none",display:"flex",marginBottom:20}}>✉ Send Invitation</a>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div className="card-title">All Events</div>
        <select style={{fontSize:13,padding:"4px 8px",border:"1.5px solid var(--border-md)",borderRadius:"var(--radius-sm)",fontFamily:"DM Sans,sans-serif"}} value={filterSeason} onChange={e=>setFilterSeason(e.target.value==="all"?"all":parseInt(e.target.value))}>
          <option value="all">All Seasons</option>
          {allSeasonsList.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {filteredEvents.map((ev:any)=>(
        <div key={ev.event_id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:15}}>{formatDate(ev.date)}</div>
            <div style={{fontSize:13,color:"var(--text-muted)"}}>{ev.course_name} · <span className={`pill ${ev.status==="Completed"?"pill-green":ev.status==="Upcoming"?"pill-gold":"pill-blue"}`} style={{fontSize:10}}>{ev.status}</span></div>
          </div>
          {ev.season===currentYear&&<button className="btn btn-sm btn-outline" onClick={()=>startEdit(ev)}>Edit</button>}
          {ev.season===currentYear&&<button className="btn btn-sm btn-danger" onClick={()=>deleteEvent(ev.event_id,ev.date)}>Del</button>}
          {ev.season!==currentYear&&<span style={{fontSize:11,color:"var(--text-muted)",padding:"4px 8px"}}>view only</span>}
        </div>
      ))}
    </div>
  );
}

function PairingDashboard({golfers,courses,events,setEvents,signups,setSignups,showSuccess}:any){
  const pairingsRef=useRef<HTMLDivElement>(null);
  const [selEventId,setSelEventId]=useState(events.find((e:any)=>e.status!=="Completed")?.event_id||"");
  const [pairings,setPairings]=useState<any[]|null>(null);
  const [confirmed,setConfirmed]=useState(false);
  // 3e) Drag/move state: track which player is being moved
  const [moving,setMoving]=useState<{gid:number,fromGroup:number}|null>(null);

  const selEvent=events.find((e:any)=>e.event_id===parseInt(selEventId));
  const eventSignups=selEvent?signups.filter((s:any)=>s.event_id===selEvent.event_id&&s.attending==="Yes"):[];

  // Load existing confirmed pairings into local state for editing
  useEffect(()=>{
    if(!selEvent||selEvent.status!=="Pairings Set")return;
    const grouped:Record<string,number[]>={};
    eventSignups.forEach((s:any)=>{
      if(!s.assigned_tee_time)return;
      (grouped[s.assigned_tee_time]=grouped[s.assigned_tee_time]||[]).push(s.golfer_id);
    });
    const loaded=Object.entries(grouped).map(([teeTime,players])=>({teeTime,players}));
    if(loaded.length>0){setPairings(loaded);setConfirmed(true);}
  },[selEventId]);

  const runPairings=()=>{
    const a=eventSignups.map((s:any)=>({golfer_id:s.golfer_id,sponsor_golfer_id:s.sponsor_golfer_id}));
    setPairings(runPairingEngine(a,selEvent.tee_times));
    setConfirmed(false);setMoving(null);
    setTimeout(()=>pairingsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),100);
  };

  // 3e) Move a player to a different group
  const movePlayer=(gid:number,fromGroup:number,toGroup:number)=>{
    if(!pairings)return;
    setPairings(prev=>{
      const next=prev!.map(g=>({...g,players:[...g.players]}));
      next[fromGroup].players=next[fromGroup].players.filter((id:number)=>id!==gid);
      next[toGroup].players=[...next[toGroup].players,gid];
      return next;
    });
    setMoving(null);
  };

  const confirmPairings=()=>{
    if(!pairings||!selEvent)return;
    const teeMap:Record<number,string>={};
    pairings.forEach(g=>g.players.forEach((gid:number)=>{teeMap[gid]=g.teeTime;}));
    setSignups((p:any)=>p.map((s:any)=>{
      if(s.event_id!==selEvent.event_id||!teeMap[s.golfer_id])return s;
      return{...s,assigned_tee_time:teeMap[s.golfer_id]};
    }));
    setEvents((p:any)=>p.map((e:any)=>e.event_id===selEvent.event_id?{...e,status:"Pairings Set"}:e));
    setConfirmed(true);setMoving(null);showSuccess("Pairings confirmed");
  };

  const clearPairings=()=>{
    if(!selEvent)return;
    if(!window.confirm("Clear all pairings for this event? This will reset it to Upcoming."))return;
    setSignups((p:any)=>p.map((s:any)=>s.event_id===selEvent.event_id?{...s,assigned_tee_time:null}:s));
    setEvents((p:any)=>p.map((e:any)=>e.event_id===selEvent.event_id?{...e,status:"Upcoming"}:e));
    // Persist to DB
    eventSignups.forEach((s:any)=>{
      if(s.signup_id<1e12)
        supabase.from("event_signups").update({assigned_tee_time:null},{signup_id:s.signup_id}).catch(()=>{});
    });
    setPairings(null);setConfirmed(false);setMoving(null);
    showSuccess("Pairings cleared -- event reset to Upcoming");
  };

  const buildBody=()=>{
    if(!pairings||!selEvent)return"";
    let b=`Saturday School - Pairings\n${formatDate(selEvent.date)} @ ${selEvent.course_name}\n\n`;
    pairings.forEach((g:any,i:number)=>{
      b+=`Group ${i+1} - Tee: ${g.teeTime}\n`;
      g.players.forEach((gid:number)=>{
        const gl=golfers.find((x:any)=>x.golfer_id===gid);
        b+=`  * ${gl?.first_name} ${gl?.last_name}${gl?.is_guest?" (Guest)":""}\n`;
      });b+="\n";
    });
    return b;
  };

  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);

  return(
    <div>
      <div className="card-title" style={{marginBottom:12}}>Pairing Engine</div>
      <div className="form-group"><label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value);setPairings(null);setConfirmed(false);setMoving(null);}}>
          <option value="">Select event…</option>
          {events.filter((e:any)=>e.status!=="Completed").map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
        </select>
      </div>
      {selEvent&&<div className="card" style={{padding:"10px 14px",marginBottom:12}}>
        <div className="info-row"><span className="info-key">Confirmed players</span><span className="info-val" style={{color:"var(--green-700)",fontWeight:700}}>{eventSignups.length}</span></div>
        <div className="info-row"><span className="info-key">Tee times</span><span className="info-val">{selEvent.tee_times.join(" · ")}</span></div>
        <div className="info-row"><span className="info-key">Status</span><span className="pill pill-gold">{selEvent.status}</span></div>
      </div>}
      <button className="btn btn-gold btn-full" onClick={runPairings} disabled={!selEvent||eventSignups.length<2}>🎲 {confirmed?"Re-generate Pairings":"Generate Pairings"}</button>

      {pairings&&(
        <div ref={pairingsRef} style={{marginTop:14}}>
          {/* 3e) Adjustment hint */}
          <div style={{fontSize:13,color:"var(--text-muted)",marginBottom:8}}>
            {moving
              ?<span style={{color:"var(--gold-700)",fontWeight:600}}>Tap a group to move {golferName(golfers,moving.gid).split(" ")[0]} there · <button style={{background:"none",border:"none",color:"var(--red-600)",cursor:"pointer",fontSize:13,fontWeight:600}} onClick={()=>setMoving(null)}>Cancel</button></span>
              :"Tap a player name to move them to another group"}
          </div>

          {pairings.map((group:any,i:number)=>(
            <div key={i} className="pairing-card" style={moving&&moving.fromGroup!==i?{borderColor:"var(--green-400)",cursor:"pointer"}:{}}>
              <div
                className="pairing-header"
                onClick={()=>{if(moving&&moving.fromGroup!==i)movePlayer(moving.gid,moving.fromGroup,i);}}
                style={{cursor:moving&&moving.fromGroup!==i?"pointer":"default"}}
              >
                <span className="pairing-time">⏱ {group.teeTime}</span>
                <span className="pairing-group">Group {i+1} · {group.players.length} players{moving&&moving.fromGroup!==i?" -- tap to move here":""}</span>
              </div>
              <div className="pairing-body">
                {group.players.map((gid:number)=>{
                  const g=golfers.find((x:any)=>x.golfer_id===gid);
                  const isMoving=moving?.gid===gid;
                  return(
                    <div key={gid} className="pairing-player"
                      style={{background:isMoving?"var(--gold-50)":undefined,cursor:"pointer"}}
                      onClick={()=>{if(!moving)setMoving({gid,fromGroup:i});}}
                    >
                      <div>
                        <span style={{fontWeight:500,color:isMoving?"var(--gold-700)":undefined}}>{g?.first_name} {g?.last_name}{isMoving?" ✋":""}</span>
                        {g?.is_guest&&<span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px",marginLeft:5,color:"var(--gold-800)"}}>guest</span>}
                      </div>
                      <span style={{fontSize:13,color:"var(--text-muted)"}}>HCP {g?.current_handicap_index?.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={confirmPairings}>{confirmed?"✓ Update Pairings":"Confirm Pairings"}</button>
            <a href={`mailto:?cc=${allEmails.join(",")}&subject=Saturday School Pairings - ${formatDate(selEvent?.date)}&body=${encodeURIComponent(buildBody())}`} className="btn btn-outline" style={{flex:1,textDecoration:"none"}}>✉ Email</a>
          </div>
          {selEvent?.status==="Pairings Set"&&(
            <button
              className="btn btn-outline btn-full"
              style={{marginTop:8,color:"var(--red-600)",borderColor:"var(--red-300)",fontSize:14}}
              onClick={clearPairings}
            >🗑 Clear Pairings</button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANALYTICS TAB -- rich dashboard
// ============================================================
// ChartCanvas: mounts a canvas via ref and builds the chart.
// Avoids getElementById race conditions entirely.
// ============================================================
function ChartCanvas({config,deps,height=200,style}:{
  config:object, deps:any[], height?:number, style?:any
}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current; if(!canvas)return;
    const existing=ChartJS.getChart(canvas); if(existing)existing.destroy();
    new ChartJS(canvas,config as any);
    return()=>{ const c=ChartJS.getChart(canvas); if(c)c.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[...deps]);
  return(
    <div style={{position:"relative",width:"100%",height,...(style||{})}}>
      <canvas ref={ref}/>
    </div>
  );
}

// Derive wins/earnings for analytics (same logic as golferStats but for all golfers at once)
function calcSeasonLeaderData(golfers:any[],leaderboard:any[],events:any[],season:number){
  const seasonEventIds=new Set(events.filter((e:any)=>e.season===season).map((e:any)=>e.event_id));
  const memberGolfers=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active");
  
  // Deduplicate leaderboard entries: one per golfer per event
  const deduped:any[]=[];
  leaderboard.filter((r:any)=>seasonEventIds.has(r.event_id)).forEach((r:any)=>{
    const ex=deduped.find((x:any)=>x.event_id===r.event_id&&x.golfer_id===r.golfer_id);
    if(ex){if(r.total_stableford_points>ex.total_stableford_points)Object.assign(ex,r);}
    else deduped.push({...r});
  });

  const stats:Record<number,{rounds:number,totalPts:number,wins:number,seconds:number,earned:number,best:number,worst:number,allPts:number[]}> = {};
  memberGolfers.forEach(g=>{
    stats[g.golfer_id]={rounds:0,totalPts:0,wins:0,seconds:0,earned:0,best:0,worst:999,allPts:[]};
  });

  // Sort deduped oldest-first so allPts[0] = earliest round, allPts[last] = most recent
  // This ensures firstHalf/secondHalf splits and trend calculations are chronologically correct
  const evDateMap2:Record<number,number>={};
  events.forEach((e:any)=>{evDateMap2[e.event_id]=new Date(e.date+"T00:00:00").getTime();});
  deduped.sort((a:any,b:any)=>(evDateMap2[a.event_id]||0)-(evDateMap2[b.event_id]||0));

  deduped.filter((r:any)=>!golfers.find((g:any)=>g.golfer_id===r.golfer_id)?.is_guest).forEach((r:any)=>{
    if(!stats[r.golfer_id])return;
    const s=stats[r.golfer_id];
    s.rounds++;
    s.totalPts+=r.total_stableford_points;
    s.allPts.push(r.total_stableford_points);
    if(r.total_stableford_points>s.best)s.best=r.total_stableford_points;
    if(r.total_stableford_points<s.worst)s.worst=r.total_stableford_points;
  });

  // Per-event wins/earnings
  [...seasonEventIds].forEach(eid=>{
    const paidEv=deduped.filter((r:any)=>r.event_id===eid&&r.buy_in_paid).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
    if(!paidEv.length)return;
    const pot=paidEv.length*20;
    const topPts=paidEv[0].total_stableford_points;
    const tied1st=paidEv.filter((e:any)=>e.total_stableford_points===topPts);
    const secondPts=tied1st.length===1&&paidEv.length>1?paidEv[1]?.total_stableford_points:null;
    const tied2nd=secondPts!=null?paidEv.filter((e:any)=>e.total_stableford_points===secondPts):[];
    tied1st.forEach((e:any)=>{
      if(stats[e.golfer_id]){
        stats[e.golfer_id].wins++;
        stats[e.golfer_id].earned+=tied1st.length===1?pot*(2/3):pot/tied1st.length;
      }
    });
    tied2nd.forEach((e:any)=>{
      if(stats[e.golfer_id]){stats[e.golfer_id].seconds++;stats[e.golfer_id].earned+=(pot*(1/3))/tied2nd.length;}
    });
  });

  return memberGolfers.map(g=>{
    const s=stats[g.golfer_id];
    if(!s||!s.rounds)return null;
    const avg=s.rounds>0?s.totalPts/s.rounds:0;
    return{golfer:g,rounds:s.rounds,avg,wins:s.wins,seconds:s.seconds,earned:s.earned,best:s.best,worst:s.worst===999?0:s.worst,allPts:s.allPts};
  }).filter(Boolean);
}

function AnalyticsTab({golfers,courses,events,leaderboard,signups,holeScores}:any){
  const [subTab,setSubTab]=useState("overview");
  const [selGolfer,setSelGolfer]=useState("");
  const allSeasons=[...new Set(events.map((e:any)=>e.season))].sort((a:any,b:any)=>b-a) as number[];
  const [selSeason,setSelSeason]=useState<number>(allSeasons[0]||new Date().getFullYear());

  const seasonData=calcSeasonLeaderData(golfers,leaderboard,events,selSeason);
  const seasonEvents=events.filter((e:any)=>e.season===selSeason&&e.status==="Completed");

  const courseNames=uniqueCourseNames(courses);
  const courseAvgs=courseNames.map(name=>{
    const evIds=events.filter((e:any)=>e.course_name===name&&e.season===selSeason).map((e:any)=>e.event_id);
    const entries=leaderboard.filter((r:any)=>evIds.includes(r.event_id)&&!golfers.find((g:any)=>g.golfer_id===r.golfer_id)?.is_guest);
    const avg=entries.length?entries.reduce((s:number,r:any)=>s+r.total_stableford_points,0)/entries.length:0;
    return{name,avg,count:entries.length};
  }).filter((c:any)=>c.count>0);

  const scatterData=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=>{
    const rounds=leaderboard.filter((r:any)=>r.golfer_id===g.golfer_id&&r.season===selSeason).map((r:any)=>r.total_stableford_points);
    if(!rounds.length)return null;
    return{golfer:g,hcp:g.current_handicap_index,avg:rounds.reduce((a:number,b:number)=>a+b,0)/rounds.length,rounds:rounds.length};
  }).filter(Boolean);

  const selG=golfers.find((g:any)=>g.golfer_id===parseInt(selGolfer));
  const selGData=selG?seasonData.find((d:any)=>d.golfer.golfer_id===selG.golfer_id):null;
  // Build per-round data sorted by event date
  const golferRounds=selG?seasonEvents
    .sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime())
    .map((ev:any)=>{
      const entry=leaderboard.filter((r:any)=>r.golfer_id===selG.golfer_id&&r.event_id===ev.event_id).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points)[0];
      if(!entry)return null;
      // Calc rank for this event
      const paidEv=leaderboard.filter((r:any)=>r.event_id===ev.event_id&&r.buy_in_paid).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
      const rank=paidEv.findIndex((r:any)=>r.golfer_id===selG.golfer_id)+1;
      const pot=paidEv.length*20;
      const topPts=paidEv[0]?.total_stableford_points;
      const tied1st=paidEv.filter((r:any)=>r.total_stableford_points===topPts);
      const secondPts=tied1st.length<paidEv.length?paidEv[tied1st.length]?.total_stableford_points:null;
      const tied2nd=secondPts!=null?paidEv.filter((r:any)=>r.total_stableford_points===secondPts):[];
      let roundEarned=0;
      if(tied1st.some((r:any)=>r.golfer_id===selG.golfer_id))roundEarned=(tied1st.length>1?pot:pot*0.75)/tied1st.length;
      else if(tied2nd.some((r:any)=>r.golfer_id===selG.golfer_id))roundEarned=(pot*0.25)/tied2nd.length;
      return{pts:entry.total_stableford_points,eid:ev.event_id,date:ev.date,course:ev.course_name,rank,players:paidEv.length,earned:roundEarned};
    }).filter(Boolean):[];

  const SUBTABS=[{id:"overview",label:"Overview"},{id:"odds",label:"Odds"},{id:"golfer",label:"By Golfer"},{id:"consistency",label:"Consistency"},{id:"course",label:"By Course"},{id:"scatter",label:"HCP vs Pts"}];

  return(
    <div>
      <div className="section-title">Analytics</div>
      <div className="section-sub">Performance insights</div>
      <div className="form-group" style={{marginBottom:12}}>
        <select className="form-select" value={selSeason} onChange={e=>setSelSeason(parseInt(e.target.value))}>
          {allSeasons.map(y=><option key={y} value={y}>{y} Season</option>)}
        </select>
      </div>
      <div className="tab-sub">
        {SUBTABS.map(t=>(
          <button key={t.id} className={`tab-sub-btn${subTab===t.id?" active":""}`} onClick={()=>setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {subTab==="overview"&&<SeasonOverview seasonData={seasonData} seasonEvents={seasonEvents} season={selSeason} leaderboard={leaderboard} golfers={golfers}/>}
      {subTab==="course"&&<CourseChart courseAvgs={courseAvgs} holeScores={holeScores} events={events} courses={courses} leaderboard={leaderboard} golfers={golfers}/>}
      {subTab==="consistency"&&<ConsistencyTable seasonData={seasonData}/>}
      {subTab==="scatter"&&<ScatterChart scatterData={scatterData}/>}
      {subTab==="golfer"&&(
        <>
          <div className="form-group">
            <label className="form-label">Select Golfer</label>
            <select className="form-select" value={selGolfer} onChange={e=>setSelGolfer(e.target.value)}>
              <option value="">Choose golfer…</option>
              {golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").sort((a:any,b:any)=>a.first_name.localeCompare(b.first_name)).map((g:any)=>(
                <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
              ))}
            </select>
          </div>
          {selG&&golferRounds.length>0&&<GolferHistoryChart golfer={selG} rounds={golferRounds} seasonData={selGData} leaderboard={leaderboard} golfers={golfers} seasonEvents={seasonEvents}/>}
          {selG&&golferRounds.length===0&&<div className="empty-state"><div className="empty-text">No rounds recorded this season</div></div>}
        </>
      )}
      {subTab==="odds"&&<OddsTab golfers={golfers} leaderboard={leaderboard} events={events} signups={signups} courses={courses} holeScores={holeScores} season={selSeason}/>}
    </div>
  );
}


// ------------------------------------------------------------------
// ODDS ENGINE
// ------------------------------------------------------------------
//
// FORMULAS USED (documented here for transparency)
//
// -- Per-golfer profile ------------------------------------------
//
// 1. WEIGHTED AVERAGE (decay factor d=0.88 per round going back)
//    weightedAvg = -(score_i - d^i) / -(d^i)
//    where i=0 is the most recent round. d=0.88 means each prior
//    round is worth 88% of the next more-recent round.
//
// 2. STANDARD DEVIATION (consistency)
//    - = sqrt( -(score_i - mean)- / n )
//    Lower - = more consistent = lower variance in projection.
//
// 3. TREND (slope of linear regression over last N rounds)
//    Using least-squares slope: b = (n--xy - -x--y) / (n--x- - (-x)-)
//    Positive slope = improving. Negative = declining.
//    Trend used to nudge weightedAvg: projectedScore += trend * 0.5
//
// 4. COURSE ADJUSTMENT
//    For each course the golfer has played, compute
//    courseAdj = golferAvgAtCourse - golferOverallAvg
//    Applied as a signed delta to projectedScore.
//    If no history at this course, adjustment = 0.
//
// 5. HCP TREND ADJUSTMENT
//    Compare average HCP from first half vs second half of signups
//    where playing_handicap is recorded. Rising HCP -> harder to score
//    -> subtract up to 1.0 pt from projection. Falling HCP -> easier.
//    hcpTrendAdj = (hcpTrendSlope * -0.3), clamped to [-1.0, +1.0]
//
// 6. PROJECTED SCORE
//    proj = weightedAvg + (trend - 0.5) + courseAdj + hcpTrendAdj
//    Clamped to [max(0, globalMin-2), globalMax+2]
//
// -- Win probability ---------------------------------------------
//
// 7. RAW WIN PROBABILITY via Monte Carlo simulation (N=5000 trials)
//    Each trial: draw a score for every playing golfer from
//    Normal(proj_i, -_i). Winner = highest draw.
//    rawWinProb_i = wins_i / N
//
// 8. HOUSE EDGE (3% vigorish)
//    The sum of all raw win probs = 1.0 (zero-sum).
//    We apply vig by scaling: adjProb_i = rawWinProb_i / (1 + VIG)
//    This creates a ~3% book margin.
//
// 9. AMERICAN ODDS from probability p
//    If p >= 0.5:  odds = round(-(p / (1-p)) - 100)   -> negative (favorite)
//    If p < 0.5:   odds = round(((1-p) / p) - 100)    -> positive (underdog)
//
// -- Head-to-head ------------------------------------------------
//
// 10. H2H WIN PROBABILITY
//     When both golfers have played the same event, track who scored higher.
//     h2hRecord = { wins_A, wins_B, ties }
//     h2hAdj: weight recent matchups (d=0.85 per prior event)
//     h2hBaseProb_A = weightedH2HWins_A / (weightedH2HWins_A + weightedH2HWins_B)
//     Blend 60% Monte Carlo projection, 40% historical H2H:
//     finalProb_A = 0.60 - monteCarloProb_A + 0.40 - h2hBaseProb_A
//     (Falls back to 100% Monte Carlo if <3 shared events)
//
// 11. SPREAD (point differential projection)
//     spread = projA - projB  (positive = A favored by that margin)
//     spreadSigma = sqrt(-A- + -B-)   (combined uncertainty)
//     Spread odds: favorite at -110, underdog at +100 (standard -10 vig line)
//     For ties/pushes: if |spread| < 0.5, display "Pick'em"
//
// ------------------------------------------------------------------

const DECAY=0.88;     // recency weight per round
const H2H_DECAY=0.85; // recency weight per shared event
const VIG=0.03;       // house edge (3%)
const MC_TRIALS=5000; // Monte Carlo sample count

// Gaussian sample via Box-Muller
function randNorm(mean:number,sd:number):number{
  const u=1-Math.random(),v=Math.random();
  return mean+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

// Least-squares slope over an array (index = x, value = y)
function lsSlope(arr:number[]):number{
  const n=arr.length; if(n<2)return 0;
  let sx=0,sy=0,sxy=0,sx2=0;
  arr.forEach((y,i)=>{sx+=i;sy+=y;sxy+=i*y;sx2+=i*i;});
  const denom=n*sx2-sx*sx;
  return denom===0?0:(n*sxy-sx*sy)/denom;
}

// Decay-weighted average (index 0 = most recent)
function weightedAvg(arr:number[]):number{
  if(!arr.length)return 0;
  let num=0,den=0;
  arr.forEach((v,i)=>{const w=Math.pow(DECAY,i);num+=v*w;den+=w;});
  return num/den;
}

// Standard deviation
function stdDev(arr:number[],mean:number):number{
  if(arr.length<2)return 3.0; // fallback uncertainty
  const v=arr.reduce((s,x)=>s+(x-mean)**2,0)/arr.length;
  return Math.max(1.5,Math.sqrt(v)); // floor at 1.5 to prevent degenerate odds
}

// Build a golfer's scoring history from leaderboard, sorted newest-first
function golferHistory(leaderboard:any[],events:any[],gid:number){
  const evMap:Record<number,string>={};
  events.forEach((e:any)=>{evMap[e.event_id]=e.date;});
  const rows=leaderboard
    .filter((r:any)=>r.golfer_id===gid&&!r.is_guest_entry)
    .map((r:any)=>({pts:r.total_stableford_points,eid:r.event_id,date:evMap[r.event_id]||"",course:""}))
    .filter(r=>r.date);
  // Sort newest first
  rows.sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  // Attach course name
  events.forEach((e:any)=>{rows.forEach((r:any)=>{if(r.eid===e.event_id)r.course=e.course_name;});});
  return rows;
}

// Course adjustment: how does this golfer perform at this course vs overall?
function courseAdj(history:any[],courseName:string):number{
  const all=history.map((r:any)=>r.pts);
  if(!all.length)return 0;
  const overall=all.reduce((a:number,b:number)=>a+b,0)/all.length;
  const atCourse=history.filter((r:any)=>r.course===courseName).map((r:any)=>r.pts);
  if(atCourse.length<2)return 0;
  const courseAvg=atCourse.reduce((a:number,b:number)=>a+b,0)/atCourse.length;
  return courseAvg-overall;
}

// HCP trend adjustment from signups: rising HCP = penalty, falling = bonus
function hcpTrendAdj(signups:any[],events:any[],gid:number):number{
  const evMap:Record<number,string>={};
  events.forEach((e:any)=>{evMap[e.event_id]=e.date;});
  const hcpData=signups
    .filter((s:any)=>s.golfer_id===gid&&s.playing_handicap!=null)
    .map((s:any)=>({hcp:s.playing_handicap,date:evMap[s.event_id]||""}))
    .filter(s=>s.date)
    .sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  if(hcpData.length<3)return 0;
  const slope=lsSlope(hcpData.map((h:any)=>h.hcp));
  // Rising HCP = harder to score = negative adjustment (capped -1.0)
  return Math.max(-1.0,Math.min(1.0,-slope*0.3));
}

// Build a projection profile for one golfer
function buildProfile(g:any,leaderboard:any[],events:any[],signups:any[],courseName:string,playingIds:Set<number>){
  const hist=golferHistory(leaderboard,events,g.golfer_id);
  // Only use rounds when this golfer was in the paid field
  const scored=hist.filter((r:any)=>{
    const ev=events.find((e:any)=>e.event_id===r.eid);
    return ev!=null;
  });
  if(!scored.length)return null;
  const pts=scored.map((r:any)=>r.pts);
  const wAvg=weightedAvg(pts);
  const mean=pts.reduce((a:number,b:number)=>a+b,0)/pts.length;
  const sd=stdDev(pts,mean);
  const trend=lsSlope([...pts].reverse()); // oldest-first for slope
  const cAdj=courseAdj(scored,courseName);
  const hAdj=hcpTrendAdj(signups,events,g.golfer_id);
  const proj=wAvg+(trend*0.5)+cAdj+hAdj;
  return{
    golfer:g,
    proj:Math.round(proj*10)/10,
    wAvg:Math.round(wAvg*10)/10,
    sd:Math.round(sd*100)/100,
    trend:Math.round(trend*100)/100,
    cAdj:Math.round(cAdj*10)/10,
    hAdj:Math.round(hAdj*10)/10,
    rounds:pts.length,
    hist:scored.slice(0,8) // last 8 for display
  };
}

// American odds string from probability
function toAmericanOdds(p:number):string{
  if(p<=0||p>=1)return "N/A";
  if(p>=0.5)return String(Math.round(-(p/(1-p))*100));
  return "+"+Math.round(((1-p)/p)*100);
}

// Full field Monte Carlo win probability
function calcFieldOdds(profiles:any[]){
  if(!profiles.length)return[];
  const wins=new Array(profiles.length).fill(0);
  for(let t=0;t<MC_TRIALS;t++){
    const draws=profiles.map(p=>randNorm(p.proj,p.sd));
    const max=Math.max(...draws);
    // Ties: all winners share
    const winIdx=draws.map((d,i)=>d===max?i:-1).filter(i=>i>=0);
    winIdx.forEach(i=>{wins[i]+=1/winIdx.length;});
  }
  const rawProbs=wins.map(w=>w/MC_TRIALS);
  // Apply vig
  const adjProbs=rawProbs.map(p=>p/(1+VIG));
  return adjProbs;
}

// H2H shared event history (newest-first weighted)
function h2hHistory(leaderboard:any[],events:any[],gidA:number,gidB:number){
  const evMap:Record<number,string>={};
  events.forEach((e:any)=>{evMap[e.event_id]=e.date;});
  const sharedEids=[...new Set(
    leaderboard.filter((r:any)=>r.golfer_id===gidA||r.golfer_id===gidB).map((r:any)=>r.event_id)
  )].filter(eid=>{
    const hasA=leaderboard.some((r:any)=>r.event_id===eid&&r.golfer_id===gidA);
    const hasB=leaderboard.some((r:any)=>r.event_id===eid&&r.golfer_id===gidB);
    return hasA&&hasB;
  });
  return sharedEids
    .map(eid=>{
      const rA=leaderboard.filter((r:any)=>r.event_id===eid&&r.golfer_id===gidA).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points)[0];
      const rB=leaderboard.filter((r:any)=>r.event_id===eid&&r.golfer_id===gidB).sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points)[0];
      return{eid,date:evMap[eid]||"",ptsA:rA?.total_stableford_points,ptsB:rB?.total_stableford_points};
    })
    .filter(r=>r.ptsA!=null&&r.ptsB!=null)
    .sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());
}

function h2hWinProb(shared:any[],projProbA:number){
  if(shared.length<3)return projProbA; // not enough H2H -- use projection only
  let wA=0,wB=0;
  shared.forEach((r:any,i:number)=>{
    const w=Math.pow(H2H_DECAY,i);
    if(r.ptsA>r.ptsB)wA+=w;
    else if(r.ptsB>r.ptsA)wB+=w;
    else{wA+=w/2;wB+=w/2;}
  });
  const h2hProb=wA/(wA+wB);
  // 60% Monte Carlo, 40% H2H record
  return 0.60*projProbA+0.40*h2hProb;
}

// ------------------------------------------------------------------
// ODDS TAB COMPONENT
// ------------------------------------------------------------------

// -- H2H Hole-by-Hole helpers ----------------------------------

// Estimate per-hole Stableford pts from a total when no HxH data exists.
// Uses difficulty weighting: stroke index determines stroke allocation,
// which drives how many pts each hole is likely worth.
function estimateHolePts(totalPts:number, course:any):number[]{
  if(!course||!course.hole_stroke_indices||!course.hole_pars)
    return Array(18).fill(totalPts/18);
  const si:number[]=course.hole_stroke_indices;
  // Weight = ease factor: lower stroke index = harder = likely fewer pts
  // We use (19 - SI) so hole SI=1 (hardest) gets weight 18, SI=18 (easiest) gets weight 1
  const weights=si.map((s:number)=>19-s);
  const wSum=weights.reduce((a:number,b:number)=>a+b,0);
  const raw=weights.map((w:number)=>totalPts*(w/wSum));
  // Round preserving total: greedy rounding
  const floored=raw.map(Math.floor);
  let remainder=totalPts-floored.reduce((a:number,b:number)=>a+b,0);
  const diffs=raw.map((r:number,i:number)=>r-floored[i]);
  const order=[...diffs.map((_:number,i:number)=>i)].sort((a:number,b:number)=>diffs[b]-diffs[a]);
  order.forEach((i:number)=>{if(remainder>0){floored[i]++;remainder--;}});
  return floored;
}

// Build per-hole history for one golfer across a list of shared events.
// Returns array of 18 arrays, each containing {pts, weight} objects.
function buildHoleHistory(
  gid:number,
  sharedEvents:any[], // [{eid, date}] sorted newest-first
  leaderboard:any[],
  holeScores:any[],
  courses:any[],
  events:any[]
):{pts:number,weight:number}[][]{
  const perHole:Array<{pts:number,weight:number}[]>=Array.from({length:18},()=>[]);
  sharedEvents.forEach((ev:any,idx:number)=>{
    const weight=Math.pow(0.85,idx);
    const entry=leaderboard.filter((r:any)=>r.event_id===ev.eid&&r.golfer_id===gid)
      .sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points)[0];
    if(!entry)return;
    // Try actual hole scores first
    const hs=holeScores.filter((h:any)=>h.summary_id===entry.summary_id)
      .sort((a:any,b:any)=>a.hole_number-b.hole_number);
    if(hs.length>=18){
      hs.slice(0,18).forEach((h:any,i:number)=>{
        perHole[i].push({pts:h.stableford_points??0,weight});
      });
    } else {
      // Fall back to estimation using course for this event
      const evObj=events.find((e:any)=>e.event_id===ev.eid);
      // Find the course this golfer played (use any tee of the event course)
      const eventCourse=evObj?courses.find((c:any)=>c.course_name===evObj.course_name):null;
      if(!eventCourse)return;
      const est=estimateHolePts(entry.total_stableford_points,eventCourse);
      est.forEach((p:number,i:number)=>{perHole[i].push({pts:p,weight});});
    }
  });
  return perHole;
}

// Compute weighted average per hole
function holeWeightedAvg(holePts:{pts:number,weight:number}[]):number{
  if(!holePts.length)return 0;
  const num=holePts.reduce((s,x)=>s+x.pts*x.weight,0);
  const den=holePts.reduce((s,x)=>s+x.weight,0);
  return den>0?num/den:0;
}

function OddsTab({golfers,leaderboard,events,signups,courses,holeScores,season}:any){
  const [oddsMode,setOddsMode]=useState<"field"|"h2h">("field");
  // Field odds state
  const completedAndUpcoming=events.filter((e:any)=>e.status!=="Cancelled");
  const upcomingEvents=[...events.filter((e:any)=>e.status==="Upcoming"||e.status==="Pairings Set"||e.status==="In-Progress")].sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  const allEventsSorted=[...completedAndUpcoming].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const [selEventId,setSelEventId]=useState<string>(String(upcomingEvents[0]?.event_id||allEventsSorted[0]?.event_id||""));

  // Default-exclude golfers who haven't played in the last 60 days.
  // Computed once at mount via the lazy useState initializer.
  const [excludedIds,setExcludedIds]=useState<Set<number>>(()=>{
    const cutoff=Date.now()-60*24*60*60*1000; // 60 days ago in ms
    const lastPlayed:Record<number,number>={};
    const evDateMap:Record<number,number>={};
    events.forEach((e:any)=>{evDateMap[e.event_id]=new Date(e.date+"T00:00:00").getTime();});
    leaderboard.forEach((r:any)=>{
      const evMs=evDateMap[r.event_id];
      if(!evMs)return;
      if(!lastPlayed[r.golfer_id]||evMs>lastPlayed[r.golfer_id])
        lastPlayed[r.golfer_id]=evMs;
    });
    const inactive:Set<number>=new Set();
    golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").forEach((g:any)=>{
      const last=lastPlayed[g.golfer_id];
      if(!last||last<cutoff)inactive.add(g.golfer_id as number);
    });
    return inactive as Set<number>;
  });

  // H2H state
  const [h2hA,setH2hA]=useState("");
  const [h2hB,setH2hB]=useState("");

  const selEvent=events.find((e:any)=>e.event_id===parseInt(selEventId));
  const members=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").sort((a:any,b:any)=>a.first_name.localeCompare(b.first_name));

  // Get signups for the selected event to know default playing field
  const eventSignupIds=new Set(
    signups.filter((s:any)=>s.event_id===parseInt(selEventId)&&s.attending==="Yes").map((s:any)=>s.golfer_id)
  );
  // If no signups, treat all members as playing
  const defaultField=eventSignupIds.size>0
    ?members.filter((g:any)=>eventSignupIds.has(g.golfer_id))
    :members;

  const playingField=defaultField.filter((g:any)=>!excludedIds.has(g.golfer_id));
  const playingIds=new Set<number>(playingField.map((g:any)=>g.golfer_id as number));

  const courseName=selEvent?.course_name||"";

  // Build profiles for all playing golfers
  const profiles=playingField
    .map((g:any)=>buildProfile(g,leaderboard,events,signups,courseName,playingIds))
    .filter(Boolean) as any[];

  // Golfers in the field who have no history (can't model them)
  const noHistoryGolfers=playingField.filter((g:any)=>!profiles.find((p:any)=>p.golfer.golfer_id===g.golfer_id));

  // Run Monte Carlo
  const adjProbs=profiles.length>=2?calcFieldOdds(profiles):profiles.map(()=>1/profiles.length);

  // Sort by probability desc
  const ranked=[...profiles.map((p:any,i:number)=>({...p,prob:adjProbs[i]}))].sort((a:any,b:any)=>b.prob-a.prob);

  // Toggle exclude
  const toggleExclude=(gid:number)=>{
    setExcludedIds(prev=>{const n=new Set(prev);n.has(gid)?n.delete(gid):n.add(gid);return n;});
  };

  // H2H computation
  const gA=golfers.find((g:any)=>g.golfer_id===parseInt(h2hA));
  const gB=golfers.find((g:any)=>g.golfer_id===parseInt(h2hB));
  const h2hSelEvent=selEvent;
  const profA=gA?buildProfile(gA,leaderboard,events,signups,courseName,new Set<number>([gA?.golfer_id,gB?.golfer_id].filter(Boolean) as number[])):null;
  const profB=gB?buildProfile(gB,leaderboard,events,signups,courseName,new Set<number>([gA?.golfer_id,gB?.golfer_id].filter(Boolean) as number[])):null;

  const h2hShared=gA&&gB?h2hHistory(leaderboard,events,gA.golfer_id,gB.golfer_id):[];

  // H2H Hole-by-Hole: build per-hole weighted averages for each golfer
  const sharedForHoles=h2hShared.map((r:any)=>({eid:r.eid,date:r.date}));
  const holeHistA=gA&&sharedForHoles.length?buildHoleHistory(gA.golfer_id,sharedForHoles,leaderboard,holeScores||[],courses,events):null;
  const holeHistB=gB&&sharedForHoles.length?buildHoleHistory(gB.golfer_id,sharedForHoles,leaderboard,holeScores||[],courses,events):null;
  // Per-hole weighted averages
  const holeAvgA=holeHistA?holeHistA.map(holeWeightedAvg):null;
  const holeAvgB=holeHistB?holeHistB.map(holeWeightedAvg):null;
  // Determine data source label: any actual hole scores used?
  const hasRealHbh=gA&&gB&&h2hShared.some((r:any)=>{
    const eA=leaderboard.find((lb:any)=>lb.event_id===r.eid&&lb.golfer_id===gA.golfer_id);
    const eB=leaderboard.find((lb:any)=>lb.event_id===r.eid&&lb.golfer_id===gB.golfer_id);
    return (eA&&(holeScores||[]).filter((h:any)=>h.summary_id===eA.summary_id).length>=18) ||
           (eB&&(holeScores||[]).filter((h:any)=>h.summary_id===eB.summary_id).length>=18);
  });
  // Find the course for the selected event to get par info
  const h2hCourse=selEvent?courses.find((c:any)=>c.course_name===selEvent.course_name):null;

  // H2H Monte Carlo (1v1)
  let rawH2hProbA=0.5;
  if(profA&&profB){
    let winsA=0;
    for(let t=0;t<MC_TRIALS;t++){
      const dA=randNorm(profA.proj,profA.sd);
      const dB=randNorm(profB.proj,profB.sd);
      if(dA>dB)winsA++;
      else if(dA===dB)winsA+=0.5;
    }
    rawH2hProbA=winsA/MC_TRIALS;
  }
  const finalProbA=profA&&profB?h2hWinProb(h2hShared,rawH2hProbA):0.5;
  const finalProbB=1-finalProbA;
  // Vig on H2H
  const h2hAdjA=finalProbA/(1+VIG);
  const h2hAdjB=finalProbB/(1+VIG);

  // Spread
  const spread=profA&&profB?Math.round((profA.proj-profB.proj)*10)/10:0;
  const spreadSigma=profA&&profB?Math.round(Math.sqrt(profA.sd**2+profB.sd**2)*10)/10:0;

  return(
    <div>
      <div className="section-title">Odds</div>
      <div className="section-sub">Projected win probabilities · powered by Monte Carlo simulation</div>

      {/* Mode toggle */}
      <div className="toggle-group" style={{marginBottom:16}}>
        <button className={"toggle-btn"+(oddsMode==="field"?" active":"")} onClick={()=>setOddsMode("field")}>Field Odds</button>
        <button className={"toggle-btn"+(oddsMode==="h2h"?" active":"")} onClick={()=>setOddsMode("h2h")}>Head-to-Head</button>
      </div>

      {/* Event selector -- upcoming / pairings set / in-progress only */}
      {upcomingEvents.length===0?(
        <div className="empty-state"><div className="empty-text">No upcoming events</div><div className="empty-sub">Odds will appear once an event is scheduled</div></div>
      ):(
        <div className="form-group">
          <label className="form-label">Event</label>
          <select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value);setExcludedIds(new Set());}}>
            {upcomingEvents.map((ev:any)=>(
              <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}{ev.status==="In-Progress"?" 🟢 Live":""}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── FIELD ODDS ── */}
      {oddsMode==="field"&&(
        <div>
          {/* Playing field toggle */}
          <div className="card-title" style={{marginBottom:6}}>Playing Field ({playingField.length} golfers)</div>
          <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:10}}>Tap a name to exclude from the field. Odds recalculate instantly.</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:18}}>
            {defaultField.map((g:any)=>{
              const excl=excludedIds.has(g.golfer_id);
              return(
                <button key={g.golfer_id}
                  onClick={()=>toggleExclude(g.golfer_id)}
                  style={{
                    padding:"5px 11px",borderRadius:20,fontSize:13,fontWeight:600,cursor:"pointer",
                    border:"1.5px solid "+(excl?"var(--border)":"var(--green-600)"),
                    background:excl?"var(--surface2)":"var(--green-50)",
                    color:excl?"var(--text-muted)":"var(--green-800)",
                    textDecoration:excl?"line-through":"none",
                    transition:"all 0.15s"
                  }}
                >{g.first_name}</button>
              );
            })}
          </div>

          {profiles.length<2&&(
            <div className="empty-state"><div className="empty-text">Need at least 2 golfers with scoring history to calculate odds.</div></div>
          )}

          {profiles.length>=2&&(
            <>
              {/* Odds board */}
              <div style={{background:"var(--green-900)",borderRadius:"var(--radius-md)",overflow:"hidden",marginBottom:4}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 60px 65px 60px",padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase"}}>Golfer</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"center"}}>Proj</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"center"}}>Win %</div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.07em",textTransform:"uppercase",textAlign:"right"}}>Odds</div>
                </div>
                {ranked.map((r:any,i:number)=>{
                  const odds=toAmericanOdds(r.prob);
                  const isFav=i===0;
                  return(
                    <div key={r.golfer.golfer_id} style={{display:"grid",gridTemplateColumns:"1fr 60px 65px 60px",padding:"11px 12px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:isFav?"rgba(196,120,0,0.12)":"transparent",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:15,fontWeight:isFav?700:500,color:isFav?"var(--gold-300)":"rgba(255,255,255,0.88)"}}>{r.golfer.first_name} {r.golfer.last_name}{isFav?" 🏆":""}</div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:1}}>
                          {r.rounds} rds · σ{r.sd} {r.trend>0.05?"↑ hot":r.trend<-0.05?"↓ cooling":"-> steady"}
                        </div>
                      </div>
                      <div style={{textAlign:"center",fontSize:17,fontWeight:700,color:"var(--green-300)"}}>{r.proj}</div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.9)"}}>{(r.prob*100).toFixed(1)}%</div>
                        <div style={{height:4,background:"rgba(255,255,255,0.15)",borderRadius:2,marginTop:3}}>
                          <div style={{height:4,borderRadius:2,background:"var(--gold-400)",width:(r.prob*100)+"%"}}/>
                        </div>
                      </div>
                      <div style={{textAlign:"right",fontSize:15,fontWeight:700,color:parseFloat(odds)<0?"var(--gold-300)":"var(--green-300)"}}>{odds}</div>
                    </div>
                  );
                })}
              </div>

              {noHistoryGolfers.length>0&&(
                <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:10,padding:"8px 12px",background:"var(--surface2)",borderRadius:"var(--radius-md)"}}>
                  ⚠ No scoring history: {noHistoryGolfers.map((g:any)=>g.first_name).join(", ")} -- excluded from odds calculation
                </div>
              )}

              

              {/* Tony.ai insight -- auto-picks best winner + matchup from field */}
              <TonyInsight ranked={ranked} selEventId={selEventId} selEvent={selEvent}/>

              {/* Methodology note */}
              <div style={{marginTop:16,padding:"12px 14px",background:"var(--surface2)",borderRadius:"var(--radius-md)",fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                <strong style={{color:"var(--text-secondary)"}}>How odds are calculated:</strong> Projected score uses decay-weighted average (d=0.88/round), linear trend, course history, and HCP trajectory. {MC_TRIALS.toLocaleString()}-trial Monte Carlo simulation determines win probabilities. Past performance does not guarantee future results.
              </div>
            </>
          )}
        </div>
      )}

      {/* ── HEAD-TO-HEAD ── */}
      {oddsMode==="h2h"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Golfer A</label>
              <select className="form-select" value={h2hA} onChange={e=>setH2hA(e.target.value)}>
                <option value="">Select…</option>
                {members.filter((g:any)=>g.golfer_id!==parseInt(h2hB)).map((g:any)=>(
                  <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Golfer B</label>
              <select className="form-select" value={h2hB} onChange={e=>setH2hB(e.target.value)}>
                <option value="">Select…</option>
                {members.filter((g:any)=>g.golfer_id!==parseInt(h2hA)).map((g:any)=>(
                  <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          {gA&&gB&&profA&&profB&&(()=>{
            const favIsA=finalProbA>=0.5;
            const favProb=favIsA?h2hAdjA:h2hAdjB;
            const dogProb=favIsA?h2hAdjB:h2hAdjA;
            const favG=favIsA?gA:gB;
            const dogG=favIsA?gB:gA;
            const favProf=favIsA?profA:profB;
            const dogProf=favIsA?profB:profA;
            const favSpread=favIsA?spread:(-spread);
            const isPick=Math.abs(spread)<0.5;

            return(
              <div>
                {/* H2H matchup card */}
                <div style={{background:"var(--green-900)",borderRadius:"var(--radius-md)",overflow:"hidden",marginBottom:16}}>
                  <div style={{padding:"12px 16px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
                    <div style={{fontSize:12,color:"var(--gold-300)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Head-to-Head · {selEvent?formatDate(selEvent.date):"All Time"}</div>
                    <div style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>{h2hShared.length} shared events · {courseName}</div>
                  </div>

                  {/* Win probability bar */}
                  <div style={{padding:"16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <div style={{textAlign:"left"}}>
                        <div style={{fontSize:16,fontWeight:700,color:"var(--gold-300)"}}>{gA.first_name}</div>
                        <div style={{fontSize:22,fontWeight:700,color:"white"}}>{(h2hAdjA*100).toFixed(1)}%</div>
                        <div style={{fontSize:16,fontWeight:700,color:parseFloat(toAmericanOdds(h2hAdjA))<0?"var(--gold-300)":"var(--green-300)"}}>{toAmericanOdds(h2hAdjA)}</div>
                      </div>
                      <div style={{fontSize:24,fontWeight:700,color:"rgba(255,255,255,0.3)",alignSelf:"center"}}>vs</div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:16,fontWeight:700,color:"var(--gold-300)"}}>{gB.first_name}</div>
                        <div style={{fontSize:22,fontWeight:700,color:"white"}}>{(h2hAdjB*100).toFixed(1)}%</div>
                        <div style={{fontSize:16,fontWeight:700,color:parseFloat(toAmericanOdds(h2hAdjB))<0?"var(--gold-300)":"var(--green-300)"}}>{toAmericanOdds(h2hAdjB)}</div>
                      </div>
                    </div>
                    {/* Probability bar */}
                    <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,0.15)",overflow:"hidden",margin:"10px 0"}}>
                      <div style={{height:"100%",borderRadius:4,background:"linear-gradient(90deg,var(--gold-400),var(--green-400))",width:(h2hAdjA*100)+"%",transition:"width 0.4s ease"}}/>
                    </div>
                  </div>

                  {/* Spread */}
                  <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,0.1)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:4}}>Point Spread</div>
                      {isPick?(
                        <div style={{fontSize:20,fontWeight:700,color:"var(--gold-300)"}}>Pick'em</div>
                      ):(
                        <>
                          <div style={{fontSize:20,fontWeight:700,color:"white"}}>{favG.first_name} -{favSpread}</div>
                          <div style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>±{spreadSigma} pts uncertainty</div>
                        </>
                      )}
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:4}}>Spread Odds</div>
                      <div style={{display:"flex",justifyContent:"center",gap:10,marginTop:4}}>
                        <div>
                          <div style={{fontSize:13,color:"var(--gold-300)",fontWeight:600}}>{favG.first_name}</div>
                          <div style={{fontSize:16,fontWeight:700,color:"white"}}>-110</div>
                        </div>
                        <div>
                          <div style={{fontSize:13,color:"var(--green-300)",fontWeight:600}}>{dogG.first_name}</div>
                          <div style={{fontSize:16,fontWeight:700,color:"white"}}>+100</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Side-by-side stat comparison */}
                <div className="card-title" style={{marginBottom:8}}>Stat Comparison</div>
                <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",overflow:"hidden",marginBottom:16}}>
                  {[
                    {label:"Projected Score",a:profA.proj,b:profB.proj,hi:"high"},
                    {label:"Weighted Avg",a:profA.wAvg,b:profB.wAvg,hi:"high"},
                    {label:"Std Dev (lower=better)",a:profA.sd,b:profB.sd,hi:"low"},
                    {label:"Trend (pts/rd)",a:profA.trend,b:profB.trend,hi:"high"},
                    {label:"Course Adj",a:profA.cAdj,b:profB.cAdj,hi:"high"},
                    {label:"HCP Trend Adj",a:profA.hAdj,b:profB.hAdj,hi:"high"},
                    {label:"Rounds Played",a:profA.rounds,b:profB.rounds,hi:"any"},
                  ].map((row:any)=>{
                    const aWins=row.hi==="high"?(row.a>row.b):row.hi==="low"?(row.a<row.b):false;
                    const bWins=row.hi==="high"?(row.b>row.a):row.hi==="low"?(row.b<row.a):false;
                    return(
                      <div key={row.label} style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",padding:"9px 14px",borderBottom:"1px solid var(--border)"}}>
                        <div style={{fontWeight:aWins?700:400,fontSize:18,textAlign:"left",color:aWins?"var(--green-700)":"var(--text-primary)"}}>{row.a}</div>
                        <div style={{fontSize:13,color:"var(--text-muted)",textAlign:"center",padding:"0 8px",letterSpacing:"0.04em"}}>{row.label}</div>
                        <div style={{fontWeight:bWins?700:400,fontSize:18,color:bWins?"var(--green-700)":"var(--text-primary)",textAlign:"right"}}>{row.b}</div>
                      </div>
                    );
                  })}
                </div>

                {/* H2H history */}
                {h2hShared.length>0&&(
                  <>
                    <div className="card-title" style={{marginBottom:8}}>Head-to-Head History</div>
                    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",overflow:"hidden",marginBottom:12}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 40px 40px 40px",padding:"7px 12px",background:"var(--green-900)",gap:4}}>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.06em",textTransform:"uppercase"}}>Date</div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",textAlign:"center"}}>{gA.first_name}</div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",textAlign:"center"}}>{gB.first_name}</div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",textAlign:"center",letterSpacing:"0.06em",textTransform:"uppercase"}}>W</div>
                      </div>
                      {h2hShared.slice(0,10).map((r:any,i:number)=>{
                        const winner=r.ptsA>r.ptsB?"A":r.ptsB>r.ptsA?"B":"T";
                        return(
                          <div key={r.eid} style={{display:"grid",gridTemplateColumns:"1fr 40px 40px 40px",padding:"8px 12px",borderBottom:"1px solid var(--border)",background:i===0?"var(--green-50)":"transparent",gap:4,alignItems:"center"}}>
                            <div style={{fontSize:16}}>{formatDate(r.date)}</div>
                            <div style={{textAlign:"center",fontWeight:winner==="A"?700:400,fontSize:16,color:winner==="A"?"var(--green-700)":"var(--text-muted)"}}>{r.ptsA}</div>
                            <div style={{textAlign:"center",fontWeight:winner==="B"?700:400,fontSize:16,color:winner==="B"?"var(--green-700)":"var(--text-muted)"}}>{r.ptsB}</div>
                            <div style={{textAlign:"center",fontSize:16,fontWeight:600,color:winner==="T"?"var(--text-muted)":winner==="A"?"var(--green-700)":"var(--gold-700)"}}>
                              {winner==="T"?"TIE":winner==="A"?(gA.first_name[0]+(gA.last_name?.[0]||"")):(gB.first_name[0]+(gB.last_name?.[0]||""))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {(() => {
                      let wA=0,wB=0,ties=0;
                      h2hShared.forEach((r:any)=>{if(r.ptsA>r.ptsB)wA++;else if(r.ptsB>r.ptsA)wB++;else ties++;});
                      return(
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                          <div className="stat-card"><div className="stat-value" style={{color:"var(--green-700)"}}>{wA}</div><div className="stat-label">{gA.first_name} wins</div></div>
                          <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)"}}>{wB}</div><div className="stat-label">{gB.first_name} wins</div></div>
                          <div className="stat-card"><div className="stat-value">{ties}</div><div className="stat-label">Ties</div></div>
                        </div>
                      );
                    })()}
                  </>
                )}
                {h2hShared.length<3&&(
                  <div style={{fontSize:13,color:"var(--text-muted)",padding:"10px 12px",background:"var(--surface2)",borderRadius:"var(--radius-md)",marginBottom:12}}>
                    ℹ️ {h2hShared.length} shared event{h2hShared.length!==1?"s":""} on record. H2H blending activates at 3+ shared events -- using projection model only.
                  </div>
                )}

                {/* ── Hole-by-Hole Odds ── */}
                {holeAvgA&&holeAvgB&&holeAvgA.length===18&&(
                  <div style={{marginBottom:16}}>
                    <div className="card-title" style={{marginBottom:4}}>
                      Hole-by-Hole Edge
                    </div>
                    <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:10}}>
                      {hasRealHbh
                        ?"Uses actual hole-by-hole scores where available, estimated from totals otherwise."
                        :"Estimated from total Stableford scores -- weighted by hole difficulty (stroke index)."
                      } Decay weight d=0.85/event, most recent first.
                    </div>

                    {/* Front 9 */}
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:6}}>Front 9</div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",minWidth:340}}>
                          <thead>
                            <tr style={{background:"var(--green-900)"}}>
                              <th style={{padding:"6px 8px",fontSize:11,fontWeight:700,color:"var(--gold-300)",textAlign:"left",width:70}}>Hole</th>
                              {[0,1,2,3,4,5,6,7,8].map(h=>(
                                <th key={h} style={{padding:"6px 4px",fontSize:12,fontWeight:700,color:"var(--gold-300)",textAlign:"center",minWidth:32}}>
                                  {h+1}
                                  {h2hCourse&&<div style={{fontSize:9,opacity:0.7,fontWeight:400}}>P{h2hCourse.hole_pars[h]}</div>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[{label:gA?.first_name,avgs:holeAvgA,color:"var(--gold-700)"},{label:gB?.first_name,avgs:holeAvgB,color:"var(--green-700)"}].map((row:any)=>(
                              <tr key={row.label} style={{borderBottom:"1px solid var(--border)"}}>
                                <td style={{padding:"7px 8px",fontWeight:700,fontSize:13,color:row.color}}>{row.label}</td>
                                {[0,1,2,3,4,5,6,7,8].map((h:number)=>{
                                  const mine=row.avgs[h];
                                  const other=row.label===gA?.first_name?holeAvgB[h]:holeAvgA[h];
                                  const edge=mine-other;
                                  const bg=edge>0.15?"rgba(26,115,64,0.15)":edge<-0.15?"rgba(192,32,32,0.08)":"transparent";
                                  return(
                                    <td key={h} style={{padding:"7px 4px",textAlign:"center",background:bg,fontSize:13,fontWeight:edge>0.15||edge<-0.15?700:400,color:edge>0.15?"var(--green-700)":edge<-0.15?"var(--red-600)":"var(--text-primary)"}}>
                                      {mine.toFixed(1)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            <tr style={{background:"var(--surface2)"}}>
                              <td style={{padding:"5px 8px",fontSize:11,fontWeight:700,color:"var(--text-muted)"}}>Edge</td>
                              {[0,1,2,3,4,5,6,7,8].map((h:number)=>{
                                const diff=holeAvgA[h]-holeAvgB[h];
                                const favA=diff>0.05;
                                const favB=diff<-0.05;
                                return(
                                  <td key={h} style={{padding:"5px 4px",textAlign:"center",fontSize:11,fontWeight:700,color:favA?"var(--green-700)":favB?"var(--gold-700)":"var(--text-muted)"}}>
                                    {Math.abs(diff)<0.05?"--":favA?(gA?.first_name[0]+(gA?.last_name?.[0]||"")):(gB?.first_name[0]+(gB?.last_name?.[0]||""))}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Back 9 */}
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:6}}>Back 9</div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",minWidth:340}}>
                          <thead>
                            <tr style={{background:"var(--green-900)"}}>
                              <th style={{padding:"6px 8px",fontSize:11,fontWeight:700,color:"var(--gold-300)",textAlign:"left",width:70}}>Hole</th>
                              {[9,10,11,12,13,14,15,16,17].map(h=>(
                                <th key={h} style={{padding:"6px 4px",fontSize:12,fontWeight:700,color:"var(--gold-300)",textAlign:"center",minWidth:32}}>
                                  {h+1}
                                  {h2hCourse&&<div style={{fontSize:9,opacity:0.7,fontWeight:400}}>P{h2hCourse.hole_pars[h]}</div>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[{label:gA?.first_name,avgs:holeAvgA,color:"var(--gold-700)"},{label:gB?.first_name,avgs:holeAvgB,color:"var(--green-700)"}].map((row:any)=>(
                              <tr key={row.label} style={{borderBottom:"1px solid var(--border)"}}>
                                <td style={{padding:"7px 8px",fontWeight:700,fontSize:13,color:row.color}}>{row.label}</td>
                                {[9,10,11,12,13,14,15,16,17].map((h:number)=>{
                                  const mine=row.avgs[h];
                                  const other=row.label===gA?.first_name?holeAvgB[h]:holeAvgA[h];
                                  const edge=mine-other;
                                  const bg=edge>0.15?"rgba(26,115,64,0.15)":edge<-0.15?"rgba(192,32,32,0.08)":"transparent";
                                  return(
                                    <td key={h} style={{padding:"7px 4px",textAlign:"center",background:bg,fontSize:13,fontWeight:edge>0.15||edge<-0.15?700:400,color:edge>0.15?"var(--green-700)":edge<-0.15?"var(--red-600)":"var(--text-primary)"}}>
                                      {mine.toFixed(1)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            <tr style={{background:"var(--surface2)"}}>
                              <td style={{padding:"5px 8px",fontSize:11,fontWeight:700,color:"var(--text-muted)"}}>Edge</td>
                              {[9,10,11,12,13,14,15,16,17].map((h:number)=>{
                                const diff=holeAvgA[h]-holeAvgB[h];
                                const favA=diff>0.05;
                                const favB=diff<-0.05;
                                return(
                                  <td key={h} style={{padding:"5px 4px",textAlign:"center",fontSize:11,fontWeight:700,color:favA?"var(--green-700)":favB?"var(--gold-700)":"var(--text-muted)"}}>
                                    {Math.abs(diff)<0.05?"--":favA?(gA?.first_name[0]+(gA?.last_name?.[0]||"")):(gB?.first_name[0]+(gB?.last_name?.[0]||""))}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Summary: holes won each */}
                    {(()=>{
                      const aWins=holeAvgA.filter((_:number,i:number)=>holeAvgA[i]-holeAvgB[i]>0.05).length;
                      const bWins=holeAvgA.filter((_:number,i:number)=>holeAvgB[i]-holeAvgA[i]>0.05).length;
                      const even=18-aWins-bWins;
                      return(
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                          <div style={{background:"var(--gold-50)",border:"1px solid var(--gold-200)",borderRadius:"var(--radius-md)",padding:"10px",textAlign:"center"}}>
                            <div style={{fontSize:22,fontWeight:700,color:"var(--gold-700)"}}>{aWins}</div>
                            <div style={{fontSize:12,color:"var(--text-muted)"}}>{gA?.first_name} holes</div>
                          </div>
                          <div style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",padding:"10px",textAlign:"center"}}>
                            <div style={{fontSize:22,fontWeight:700,color:"var(--text-muted)"}}>{even}</div>
                            <div style={{fontSize:12,color:"var(--text-muted)"}}>Even</div>
                          </div>
                          <div style={{background:"var(--green-50)",border:"1px solid var(--green-200)",borderRadius:"var(--radius-md)",padding:"10px",textAlign:"center"}}>
                            <div style={{fontSize:22,fontWeight:700,color:"var(--green-700)"}}>{bWins}</div>
                            <div style={{fontSize:12,color:"var(--text-muted)"}}>{gB?.first_name} holes</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {(!holeAvgA||!holeAvgB)&&h2hShared.length===0&&(
                  <div style={{fontSize:13,color:"var(--text-muted)",padding:"10px 12px",background:"var(--surface2)",borderRadius:"var(--radius-md)",marginBottom:12}}>
                    No shared events yet -- hole-by-hole breakdown requires at least 1 shared event.
                  </div>
                )}

                <div style={{padding:"12px 14px",background:"var(--surface2)",borderRadius:"var(--radius-md)",fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                  <strong style={{color:"var(--text-secondary)"}}>H2H methodology:</strong> Win probability blends {MC_TRIALS.toLocaleString()}-trial Monte Carlo (60%) with decay-weighted head-to-head record (40%, d=0.85/event). Spread = projected score differential. Spread line uses standard -110 vig. Hole-by-hole: actual HxH data used where available, otherwise estimates pts distribution via stroke-index difficulty weighting.
                </div>
              </div>
            );
          })()}

          {(!gA||!gB)&&(
            <div className="empty-state"><div className="empty-text">Select two golfers to see head-to-head odds</div></div>
          )}
          {gA&&gB&&(!profA||!profB)&&(
            <div className="empty-state"><div className="empty-text">One or both golfers have no scoring history -- can't calculate odds yet</div></div>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================
// TONY.AI -- Golf betting savant insight component
//
// Uses Gemini 2.0 Flash (free tier: 1,500 req/day, 1M tok/day)
// Requires VITE_GEMINI_KEY in Vercel environment variables.
// Get key free at: aistudio.google.com -> Get API Key
//
// Cache strategy (Supabase-first, localStorage fallback):
//   Checks tony_insights table (event_id, h2h_key, insight_date).
//   If row exists for today -> show it. Otherwise call Gemini,
//   store in DB, and show result. Fires at most once per day
//   per event regardless of how many users view the page.
//
// Image hosting: upload tony avatar to Supabase Storage bucket
//   "assets" and replace TONY_AVATAR with the public URL, OR
//   put the file in /public/tony.jpg in your repo (Vercel serves it).
// ============================================================

const TONY_AVATAR = "https://zxqzxlbhuepuflpatbuh.supabase.co/storage/v1/object/public/assets/tony2.png";
// To use self-hosted: const TONY_AVATAR = "/tony.jpg";

async function fetchTonyInsight(prompt:string):Promise<{winner:string,winnerOdds:string,matchup:string,matchupOdds:string,reasoning:string}|null>{
  const apiKey=(typeof import.meta!=="undefined"&&(import.meta as any).env?.VITE_GEMINI_KEY)||"";
  if(!apiKey)throw new Error("No VITE_GEMINI_KEY env var set");
  // Ask for strict JSON — no thinking, no freeform text, no truncation risk
  const fullPrompt=[
    "You are Tony — mid-level mob boss turned golf bookie. You talk like Tony Soprano: blunt, street-smart, a little menacing, occasionally self-aware. You drop references to loyalty, respect, numbers, and the life. No greetings, no sign-off. Never say you are an AI.",
    "Analyze the Stableford golf data. Do NOT always pick the favorite — find value. Low std dev means reliable, high trend means hot, course adj means they own this track.",
    "Your reasoning must sound like Tony Soprano actually said it — rough edges, mob flavor, but always grounded in the data. One or two sentences max.",
    "Return ONLY valid JSON, no markdown, no explanation outside the JSON.",
    "Format exactly: {",
    '  "winner": "First Last",',
    '  "winnerOdds": "+210",',
    '  "matchup": "First Last",',
    '  "matchupOdds": "-130",',
    '  "matchupOpponent": "First Last",',
    '  "reasoning": "Tony Soprano voice, 1-2 sentences, data-driven."',
    "}",
    "",
    prompt
  ].join("\n");
  const res=await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+apiKey,
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        contents:[{role:"user",parts:[{text:fullPrompt}]}],
        generationConfig:{
          maxOutputTokens:400,
          temperature:0.85,
          responseMimeType:"application/json",
          thinkingConfig:{thinkingBudget:0}
        }
      })
    }
  );
  if(!res.ok){
    let detail="";
    try{const j=await res.json();detail=j?.error?.message||"";}catch(_:any){}
    throw new Error("HTTP "+res.status+(detail?" -- "+detail:""));
  }
  const data=await res.json();
  const raw=(data.candidates?.[0]?.content?.parts?.[0]?.text||"").trim();
  try{
    const clean=raw.replace(/^```json/,"").replace(/^```/,"").replace(/```$/,"").trim();
    return JSON.parse(clean);
  }catch(_:any){
    // If JSON parse fails, extract fields with regex fallback
    const g=(key:string)=>{const m=raw.match(new RegExp('"'+key+'"\\s*:\\s*"([^"]+)"'));return m?m[1]:"";};
    const winner=g("winner"),winnerOdds=g("winnerOdds"),matchup=g("matchup"),matchupOdds=g("matchupOdds"),reasoning=g("reasoning");
    if(winner)return{winner,winnerOdds,matchup,matchupOdds,reasoning};
    throw new Error("Bad JSON: "+raw.slice(0,80));
  }
}

// Auto-select the most interesting H2H from the field:
// finds the pair with the smallest probability gap among top-4 golfers
// (tightest matchup = most interesting pick for Tony to call)
function pickBestH2H(ranked:any[]):{nameA:string,oddsA:string,nameB:string,oddsB:string,spread:string}|null{
  if(ranked.length<2)return null;
  const top=ranked.slice(0,Math.min(4,ranked.length));
  let best:{i:number,j:number,gap:number}={i:0,j:1,gap:999};
  for(let i=0;i<top.length-1;i++){
    for(let j=i+1;j<top.length;j++){
      const gap=Math.abs(top[i].prob-top[j].prob);
      if(gap<best.gap)best={i,j,gap};
    }
  }
  const a=top[best.i], b=top[best.j];
  const spreadVal=parseFloat((a.proj-b.proj).toFixed(1));
  const spreadStr=Math.abs(spreadVal)<0.3?"Pick'em":
    (spreadVal>0?a.golfer.first_name+" -"+Math.abs(spreadVal):b.golfer.first_name+" -"+Math.abs(spreadVal))+" pts";
  // 1v1 win probability: use each golfer's share relative to the pair only
  const sumProb=a.prob+b.prob;
  const pA=a.prob/sumProb;
  const pB=b.prob/sumProb;
  return{
    nameA:a.golfer.first_name+" "+a.golfer.last_name,
    oddsA:toAmericanOdds(pA),
    nameB:b.golfer.first_name+" "+b.golfer.last_name,
    oddsB:toAmericanOdds(pB),
    spread:spreadStr
  };
}

function TonyInsight({ranked,selEventId,selEvent}:any){
  type TonyPick={winner:string,winnerOdds:string,matchup:string,matchupOdds:string,matchupOpponent?:string,reasoning:string};
  const [pick,setPick]=useState<TonyPick|null>(null);
  const [errMsg,setErrMsg]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [imgErr,setImgErr]=useState(false);

  const today=new Date().toISOString().slice(0,10);
  const cacheKey="field";

  const buildPrompt=():string=>{
    const eventLabel=selEvent?(selEvent.course_name+" "+selEvent.date):"Unknown event";
    const fieldLines=ranked.map((r:any)=>
      r.golfer.first_name+" "+r.golfer.last_name+": "+toAmericanOdds(r.prob)
      +" (proj "+r.proj+"pts, "+r.rounds+"rds, stddev "+r.sd
      +(r.trend>0.05?" hot trend":r.trend<-0.05?" cooling":"")+")"
    ).join("; ");
    const h2h=pickBestH2H(ranked);
    const h2hLine=h2h
      ?"Tightest matchup: "+h2h.nameA+" "+h2h.oddsA+" vs "+h2h.nameB+" "+h2h.oddsB+", spread "+h2h.spread
      :"";
    return "Event: "+eventLabel+". All golfers: "+fieldLines+". "+h2hLine;
  };

  useEffect(()=>{
    if(!ranked.length||!selEventId)return;
    const eid=parseInt(selEventId);
    if(!eid)return;

    const checkAndGenerate=async()=>{
      // 1. Supabase cache
      try{
        const q="&event_id=eq."+eid+"&h2h_key=eq."+cacheKey+"&insight_date=eq."+today;
        const rows=await supabase.from("tony_insights").select("insight_text",q);
        if(rows&&rows[0]){
          try{setPick(JSON.parse(rows[0].insight_text));return;}catch(_:any){}
        }
      }catch(_:any){}

      // 2. Call Gemini
      setLoading(true); setErrMsg(null);
      try{
        const result=await fetchTonyInsight(buildPrompt());
        if(!result)throw new Error("Empty response");
        setPick(result);
        // 3. Cache as JSON string
        try{
          await supabase.from("tony_insights").upsert(
            {event_id:eid,h2h_key:cacheKey,insight_date:today,insight_text:JSON.stringify(result)},
            "event_id,h2h_key,insight_date"
          );
        }catch(_:any){}
      }catch(e:any){
        setErrMsg((e?.message||String(e)).slice(0,200));
      }finally{
        setLoading(false);
      }
    };
    checkAndGenerate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selEventId,today]);

  if(!ranked.length)return null;

  const isFav=(odds:string)=>odds.startsWith("-");

  return(
    <div style={{marginTop:18,background:"linear-gradient(135deg,#0f1f14,#1a2f1e)",borderRadius:"var(--radius-md)",border:"1.5px solid rgba(196,120,0,0.4)",overflow:"hidden"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"0px 14px",borderBottom:"1px solid rgba(196,120,0,0.2)",background:"rgba(0,0,0,0.3)"}}>
        <div style={{flexShrink:0}}>
          {imgErr
            ?<div style={{width:110,height:80,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🎯</div>
            :<img src={TONY_AVATAR} alt="Tony.ai"
                style={{width:110,height:80,objectFit:"contain",display:"block"
                  }}
                onError={()=>setImgErr(true)}/>
          }
        </div>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.05em",marginLeft:-15}}>TONY.AI</div>
          
        </div>
        <div style={{marginLeft:"auto",fontSize:13,color:"rgba(255,255,255,0.28)",textAlign:"right"}}>
          {today}<br/>
        </div>
      </div>

      {/* Loading */}
      {loading&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"16px",color:"rgba(255,255,255,0.5)",fontSize:13}}>
          <div style={{width:14,height:14,border:"2px solid rgba(196,120,0,0.4)",borderTopColor:"var(--gold-400)",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
          Analyzing the field...
        </div>
      )}

      {/* Error */}
      {!loading&&errMsg&&(
        <div style={{padding:"12px 16px",fontSize:12,color:"#f87171",fontFamily:"monospace",background:"rgba(255,0,0,0.07)"}}>
          Tony.ai error: {errMsg}
        </div>
      )}

      {/* Picks */}
      {!loading&&pick&&(
        <>
          {/* Pick rows */}
          <div style={{padding:"12px 16px 0"}}>
            {/* Row 1 — Overall winner */}
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr auto",alignItems:"center",gap:8,padding:"10px 12px",background:"rgba(196,120,0,0.1)",borderRadius:8,marginBottom:8,border:"1px solid rgba(196,120,0,0.25)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--gold-400)",letterSpacing:"0.08em",textTransform:"uppercase"}}>
                Overall
              </div>
              <div style={{fontSize:15,fontWeight:700,color:"white"}}>{pick.winner}</div>
              <div style={{
                fontSize:16,fontWeight:800,
                color:isFav(pick.winnerOdds)?"var(--gold-300)":"var(--green-300)",
                fontVariantNumeric:"tabular-nums",textAlign:"right"
              }}>{pick.winnerOdds}</div>
            </div>
            {/* Row 2 — Matchup pick */}
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr auto",alignItems:"center",gap:8,padding:"10px 12px",background:"rgba(26,115,64,0.12)",borderRadius:8,marginBottom:12,border:"1px solid rgba(26,115,64,0.3)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--green-400)",letterSpacing:"0.08em",textTransform:"uppercase"}}>
                H2H Matchup
              </div>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:"white"}}>{pick.matchup}</div>
                {pick.matchupOpponent&&(
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2,fontStyle:"italic"}}>
                    vs. {pick.matchupOpponent}
                  </div>
                )}
              </div>
              <div style={{
                fontSize:16,fontWeight:800,
                color:isFav(pick.matchupOdds)?"var(--gold-300)":"var(--green-300)",
                fontVariantNumeric:"tabular-nums",textAlign:"right"
              }}>{pick.matchupOdds}</div>
            </div>
          </div>
          {/* Reasoning */}
          <div style={{padding:"0 16px 14px",fontSize:13,color:"rgba(255,255,255,0.7)",lineHeight:1.6,fontStyle:"italic",borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:10}}>
            {pick.reasoning}
          </div>
        </>
      )}
    </div>
  );
}


// -- Season Overview Dashboard ---------------------------------
function SeasonOverview({seasonData,seasonEvents,season,leaderboard,golfers}:any){
  const totalRounds=seasonData.reduce((s:number,d:any)=>s+d.rounds,0);
  const allPts=seasonData.flatMap((d:any)=>d.allPts);
  const seasonAvg=allPts.length?allPts.reduce((a:number,b:number)=>a+b,0)/allPts.length:0;
  const highScoreEntry=allPts.length?Math.max(...allPts):0;
  const highScorer=seasonData.find((d:any)=>d.best===highScoreEntry);
  const winLeader=seasonData.length?[...seasonData].sort((a:any,b:any)=>b.wins-a.wins)[0]:null;

  // Win tally -- bar chart data
  const winData=[...seasonData].filter((d:any)=>d.wins>0).sort((a:any,b:any)=>b.wins-a.wins);
  
  // Most improved: compare first half vs second half of rounds
  const improvedData=seasonData.map((d:any)=>{
    if(d.allPts.length<4)return null;
    const half=Math.floor(d.allPts.length/2);
    const firstHalfAvg=d.allPts.slice(0,half).reduce((a:number,b:number)=>a+b,0)/half;
    const secondHalfAvg=d.allPts.slice(half).reduce((a:number,b:number)=>a+b,0)/(d.allPts.length-half);
    return{golfer:d.golfer,delta:secondHalfAvg-firstHalfAvg};
  }).filter(Boolean).sort((a:any,b:any)=>b.delta-a.delta);
  const mostImproved=improvedData[0];

  // Earnings leader
  const earningsLeader=seasonData.length?[...seasonData].sort((a:any,b:any)=>b.earned-a.earned)[0]:null;

  // Per-event scoring trend
  const eventTrend=seasonEvents
    .sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime())
    .map((ev:any)=>{
      const entries=leaderboard.filter((r:any)=>r.event_id===ev.event_id&&!golfers.find((g:any)=>g.golfer_id===r.golfer_id)?.is_guest);
      const avg=entries.length?entries.reduce((s:number,r:any)=>s+r.total_stableford_points,0)/entries.length:0;
      return{date:ev.date,avg,course:ev.course_name};
    });

  const trendConfig = {
    type:"line" as const,
    data:{
      labels:eventTrend.map((_:any,i:number)=>"Rd "+(i+1)),
      datasets:[{
        label:"Field Avg",
        data:eventTrend.map((e:any)=>parseFloat(e.avg.toFixed(1))),
        borderColor:"#1a7340",backgroundColor:"rgba(26,115,64,0.08)",
        pointBackgroundColor:"#1a7340",pointRadius:5,fill:true,tension:0.35
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{
          label:(c:any)=>(" "+c.parsed.y.toFixed(1)+" pts avg"),
          title:(items:any)=>{const ev=eventTrend[items[0].dataIndex];return formatDate(ev.date);}
        }}
      },
      scales:{
        x:{ticks:{color:"#6b5240",font:{size:12}},grid:{display:false}},
        y:{beginAtZero:false,min:24,ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}}
      }
    }
  };

  const winsConfig = {
    type:"bar" as const,
    data:{
      labels:winData.map((d:any)=>d.golfer.first_name),
      datasets:[
        {label:"Wins",data:winData.map((d:any)=>d.wins),backgroundColor:"#c47800",borderRadius:5},
        {label:"2nds",data:winData.map((d:any)=>d.seconds),backgroundColor:"rgba(26,115,64,0.45)",borderRadius:5}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{color:"#6b5240",font:{size:12}}}},
      scales:{
        x:{ticks:{color:"#6b5240",font:{size:12}},grid:{display:false}},
        y:{ticks:{color:"#6b5240",stepSize:1},grid:{color:"rgba(74,55,40,0.1)"},beginAtZero:true}
      }
    }
  };

  return(
    <div>
      {/* Season stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div className="stat-card"><div className="stat-value">{seasonEvents.length}</div><div className="stat-label">Events Played</div></div>
        <div className="stat-card"><div className="stat-value">{totalRounds}</div><div className="stat-label">Total Rounds</div></div>
        <div className="stat-card"><div className="stat-value" style={{fontSize:24}}>{seasonAvg.toFixed(1)}</div><div className="stat-label">Field Avg Pts</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)",fontSize:24}}>{highScoreEntry}</div><div className="stat-label">High Score</div></div>
      </div>

      {/* Hero highlight cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {highScorer&&(
          <div style={{background:"linear-gradient(135deg,var(--gold-900),var(--gold-700))",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{fontSize:22}}>🏆</div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>High Score</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{highScorer.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"var(--gold-300)",lineHeight:1}}>{highScoreEntry} pts</div>
          </div>
        )}
        {winLeader&&winLeader.wins>0&&(
          <div style={{background:"linear-gradient(135deg,var(--green-900),var(--green-700))",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{fontSize:22}}>🥇</div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>Win Leader</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{winLeader.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"var(--green-300)",lineHeight:1}}>{winLeader.wins} win{winLeader.wins>1?"s":""}</div>
          </div>
        )}
        {earningsLeader&&earningsLeader.earned>0&&(
          <div style={{background:"linear-gradient(135deg,var(--earth-800),var(--earth-600))",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{fontSize:22}}>💰</div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>Earnings Leader</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{earningsLeader.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"var(--gold-300)",lineHeight:1}}>${earningsLeader.earned.toFixed(0)}</div>
          </div>
        )}
        {mostImproved&&mostImproved.delta>0&&(
          <div style={{background:"linear-gradient(135deg,#1a56a0,#1a73a0)",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center",color:"white"}}>
            <div style={{fontSize:22}}>📈</div>
            <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",opacity:0.8,marginTop:2}}>Most Improved</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:4}}>{mostImproved.golfer.first_name}</div>
            <div style={{fontSize:26,fontWeight:700,color:"#9fd4f7",lineHeight:1}}>+{mostImproved.delta.toFixed(1)} pts</div>
            <div style={{fontSize:10,opacity:0.7,marginTop:4}}>2nd half avg vs 1st half</div>
          </div>
        )}
      </div>

      {/* Scoring trend */}
      {eventTrend.length>1&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="card-title" style={{marginBottom:10}}>Field Scoring Trend</div>
          <ChartCanvas config={trendConfig} deps={[season,eventTrend.length]} height={190}/>
        </div>
      )}
      {eventTrend.length<=1&&seasonEvents.length>0&&(
        <div className="card" style={{marginBottom:12,textAlign:"center",padding:"20px",color:"var(--text-muted)",fontSize:14}}>
          📊 Scoring trend chart will appear once 2+ events are completed this season.
        </div>
      )}

      {/* Win tally */}
      {winData.length>0&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="card-title" style={{marginBottom:10}}>Wins &amp; 2nd Place Finishes</div>
          <ChartCanvas config={winsConfig} deps={[season,winData.length]} height={190}/>
        </div>
      )}
      {winData.length===0&&seasonEvents.length>0&&(
        <div className="card" style={{marginBottom:12,textAlign:"center",padding:"20px",color:"var(--text-muted)",fontSize:14}}>
          🏆 Win tallies will appear once scoring is entered for this season.
        </div>
      )}

    </div>
  );
}

// -- Consistency (Std Dev) Table -------------------------------
function ConsistencyTable({seasonData}:any){
  const rows=[...seasonData].map((d:any)=>{
    if(d.allPts.length<3)return null;
    const avg=d.allPts.reduce((a:number,b:number)=>a+b,0)/d.allPts.length;
    const variance=d.allPts.reduce((s:number,p:number)=>s+(p-avg)**2,0)/d.allPts.length;
    const stdDev=Math.sqrt(variance);
    // Scoring range: max-min
    const range=d.best-d.worst;
    return{golfer:d.golfer,rounds:d.allPts.length,avg,stdDev,range,best:d.best,worst:d.worst};
  }).filter(Boolean).sort((a:any,b:any)=>a.stdDev-b.stdDev);

  return(
    <div>
      <div className="card-title" style={{marginBottom:4}}>Consistency Ranking</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>Lower std dev = more consistent. Min 3 rounds to qualify.</p>
      <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{background:"var(--green-900)"}}>
              <th style={{color:"var(--gold-300)",padding:"9px 10px",textAlign:"left",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>#</th>
              <th style={{color:"var(--gold-300)",padding:"9px 8px",textAlign:"left",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Golfer</th>
              <th style={{color:"var(--gold-300)",padding:"9px 6px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Avg</th>
              <th style={{color:"var(--gold-300)",padding:"9px 6px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Std Dev</th>
              <th style={{color:"var(--gold-300)",padding:"9px 6px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Range</th>
              <th style={{color:"var(--gold-300)",padding:"9px 8px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Rnds</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r:any,i:number)=>(
              <tr key={r.golfer.golfer_id} style={{background:i===0?"var(--green-50)":i%2===1?"var(--surface2)":undefined,borderBottom:"1px solid var(--border)"}}>
                <td style={{padding:"11px 10px",fontWeight:700,color:i===0?"var(--gold-500)":"var(--text-muted)",fontSize:18}}>{i===0?"⭐":i+1}</td>
                <td style={{padding:"11px 8px",fontWeight:600,fontSize:16}}>{r.golfer.first_name} {r.golfer.last_name}</td>
                <td style={{padding:"11px 6px",textAlign:"center",color:"var(--green-700)",fontWeight:700,fontSize:16}}>{r.avg.toFixed(1)}</td>
                <td style={{padding:"11px 6px",textAlign:"center",fontWeight:700,fontSize:16,color:i===0?"var(--green-600)":"var(--text-primary)"}}>{r.stdDev.toFixed(2)}</td>
                <td style={{padding:"11px 6px",textAlign:"center",color:"var(--text-muted)",fontSize:15}}>{r.best}-{r.worst}</td>
                <td style={{padding:"11px 8px",textAlign:"center",color:"var(--text-muted)",fontSize:15}}>{r.rounds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CourseChart({courseAvgs,holeScores,events,courses,leaderboard,golfers}:any){
  const config = {
    type:"bar" as const,
    data:{
      labels:courseAvgs.map((c:any)=>c.name),
      datasets:[{
        label:"Avg Pts",
        data:courseAvgs.map((c:any)=>parseFloat(c.avg.toFixed(1))),
        backgroundColor:["#1a7340","#c47800","#a32020","#0f4526","#9a5a00"],
        borderRadius:6
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:(c:any)=>(c.parsed.y.toFixed(1)+" pts avg")}}},
      scales:{
        y:{beginAtZero:false,min:20,ticks:{color:"#6b5240",font:{family:"DM Sans, sans-serif",size:14}},grid:{color:"rgba(74,55,40,0.1)"}},
        x:{ticks:{color:"#6b5240",font:{family:"DM Sans, sans-serif",size:13}},grid:{display:false}}
      }
    }
  };

  // Build per-hole averages across all rounds for each course
  const holeAvgByCourse=(()=>{
    const map:Record<string,Record<number,number[]>>={};
    if(!holeScores||!events||!leaderboard)return {} as Record<string,{hole:number,avgPts:number,rounds:number}[]>;
    // Map event_id -> course_name from events
    const evCourseMap:Record<number,string>={};
    events.forEach((e:any)=>{evCourseMap[e.event_id]=(e.course_name||'').trim();});
    // Map summary_id -> event_id from ALL leaderboard entries
    const summaryEvMap:Record<number,number>={};
    leaderboard.forEach((r:any)=>{summaryEvMap[r.summary_id]=r.event_id;});
    // Also map course_id -> course_name via courses table so we can
    // match tee box variants (blue/white/black) all to the same course name
    const courseIdToName:Record<number,string>={};
    if(courses){
      courses.forEach((c:any)=>{courseIdToName[c.course_id]=c.course_name;});
    }
    holeScores.forEach((h:any)=>{
      // Primary: look up via leaderboard summary_id -> event_id -> course_name
      let course:string|undefined=undefined;
      const eid=summaryEvMap[h.summary_id];
      if(eid)course=evCourseMap[eid];
      // Fallback: if summary_id didn't match (temp vs real ID mismatch),
      // try finding a leaderboard entry with a matching golfer+event via
      // the hole's summary_id being close to any leaderboard summary_id
      // (last resort: skip, don't invent data)
      if(!course)return;
      if(!map[course])map[course]={};
      if(!map[course][h.hole_number])map[course][h.hole_number]=[];
      if(h.stableford_points!=null)map[course][h.hole_number].push(h.stableford_points);
    });
    const result:Record<string,{hole:number,avgPts:number,rounds:number}[]>={};
    Object.entries(map).forEach(([course,holes])=>{
      result[course]=Array.from({length:18},(_,i)=>{
        const arr=holes[i+1]||[];
        return{hole:i+1,avgPts:arr.length?arr.reduce((a:number,b:number)=>a+b,0)/arr.length:NaN,rounds:arr.length};
      });
    });
    return result;
  })();

  return(
    <div>
      <div className="card-title" style={{marginBottom:4}}>Stableford Averages by Course</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>Field average stableford points per course this season.</p>
      {courseAvgs.map((c:any)=><div key={c.name} className="info-row"><span className="info-key">{c.name}</span><span className="info-val">{c.count>0?(c.avg.toFixed(1)+" pts avg ("+c.count+" rounds)"):"No data"}</span></div>)}
      <ChartCanvas config={config} deps={[courseAvgs.length,courseAvgs.map((c:any)=>c.avg).join()]} height={210} style={{marginTop:16}}/>

      {/* Hole-by-hole averages per course */}
      <div style={{marginTop:20}}>
        <div className="card-title" style={{marginBottom:4}}>Hole-by-Hole Scoring Average</div>
        <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>League avg Stableford pts per hole. Requires hole-by-hole entry.</p>
        {courseAvgs.map((c:any)=>{
          const courseHoles=holeAvgByCourse[c.name];
          const hasSomeData=courseHoles&&courseHoles.some((h:any)=>h.rounds>0);
          const courseRec=courses?courses.find((cr:any)=>cr.course_name===c.name):null;
          const pars:number[]=courseRec?.hole_pars||[];
          const sis:number[]=courseRec?.hole_stroke_indices||[];
          return(
            <div key={c.name} style={{marginBottom:22}}>
              <div style={{fontWeight:700,fontSize:14,color:"var(--green-800)",marginBottom:8,paddingBottom:5,borderBottom:"2px solid var(--green-100)"}}>{c.name}</div>
              {!hasSomeData?(
                <div style={{fontSize:13,color:"var(--text-muted)",fontStyle:"italic",padding:"6px 0"}}>
                  No hole-by-hole data recorded yet for this course.
                </div>
              ):(
                <>
                  {([{start:0,label:"Front 9"},{start:9,label:"Back 9"}] as {start:number,label:string}[]).map(({start,label})=>(
                    <div key={label} style={{marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:5}}>{label}</div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",minWidth:320}}>
                          <thead>
                            <tr style={{background:"var(--green-900)"}}>
                              <th style={{padding:"5px 8px",fontSize:11,color:"var(--gold-300)",fontWeight:700,textAlign:"left",width:58}}>Hole</th>
                              {Array.from({length:9},(_,i)=>(
                                <th key={i} style={{padding:"5px 4px",fontSize:12,color:"var(--gold-300)",fontWeight:700,textAlign:"center",minWidth:28}}>{start+i+1}</th>
                              ))}
                              <th style={{padding:"5px 6px",fontSize:11,color:"var(--gold-300)",fontWeight:700,textAlign:"center",minWidth:36}}>Avg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pars.length>0&&(
                              <tr style={{background:"var(--surface2)"}}>
                                <td style={{padding:"5px 8px",fontSize:11,color:"var(--text-muted)",fontWeight:600}}>Par</td>
                                {Array.from({length:9},(_,i)=>(
                                  <td key={i} style={{padding:"5px 4px",textAlign:"center",fontSize:12,color:"var(--text-muted)"}}>{pars[start+i]||"-"}</td>
                                ))}
                                <td style={{padding:"5px 6px",textAlign:"center",fontSize:12,color:"var(--text-muted)"}}>{pars.slice(start,start+9).reduce((a,b)=>a+b,0)||"-"}</td>
                              </tr>
                            )}
                            {sis.length>0&&(
                              <tr>
                                <td style={{padding:"4px 8px",fontSize:10,color:"var(--text-muted)",fontWeight:600}}>SI</td>
                                {Array.from({length:9},(_,i)=>(
                                  <td key={i} style={{padding:"4px 4px",textAlign:"center",fontSize:10,color:"var(--text-muted)"}}>{sis[start+i]||"-"}</td>
                                ))}
                                <td></td>
                              </tr>
                            )}
                            <tr>
                              <td style={{padding:"7px 8px",fontSize:11,fontWeight:700,color:"var(--text-muted)"}}>Avg Pts</td>
                              {Array.from({length:9},(_,i)=>{
                                const h=courseHoles?.[start+i];
                                const val=h&&h.rounds>0?h.avgPts:NaN;
                                const clr=isNaN(val)?"var(--border)":val>=2?"var(--green-600)":val>=1?"var(--text-secondary)":"var(--red-500)";
                                return(
                                  <td key={i} style={{padding:"7px 4px",textAlign:"center",fontWeight:isNaN(val)?400:700,fontSize:isNaN(val)?11:14,color:clr}}>
                                    {isNaN(val)?"--":val.toFixed(1)}
                                  </td>
                                );
                              })}
                              <td style={{padding:"7px 6px",textAlign:"center",fontWeight:700,fontSize:13,color:"var(--green-700)"}}>
                                {(()=>{
                                  const half=courseHoles?courseHoles.slice(start,start+9):[];
                                  const valid=half.filter((h:any)=>!isNaN(h.avgPts)&&h.rounds>0);
                                  return valid.length?(valid.reduce((s:number,h:any)=>s+h.avgPts,0)/valid.length).toFixed(1):"--";
                                })()}
                              </td>
                            </tr>
                
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScatterChart({scatterData}:any){
  const config = {
    type:"scatter" as const,
    data:{
      datasets:[{
        label:"Golfers",
        data:scatterData.map((d:any)=>({x:d.hcp,y:parseFloat(d.avg.toFixed(1)),name:d.golfer.first_name+" "+d.golfer.last_name})),
        backgroundColor:"#1a7340",pointRadius:10,pointHoverRadius:13
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:(c:any)=>(c.raw.name+": HCP "+c.raw.x+" - "+c.raw.y.toFixed(1)+" pts avg")}}
      },
      scales:{
        x:{title:{display:true,text:"Handicap Index",color:"#6b5240",font:{family:"DM Sans, sans-serif",size:13}},ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}},
        y:{title:{display:true,text:"Avg Stableford Pts",color:"#6b5240",font:{family:"DM Sans, sans-serif",size:13}},ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}}
      }
    }
  };
  if(scatterData.length<2) return(
    <div>
      <div className="card-title" style={{marginBottom:5}}>Handicap Index vs Avg Performance</div>
      <div style={{textAlign:"center",padding:"40px 20px",color:"var(--text-muted)",fontSize:14}}>
        📊 This chart needs at least 2 golfers with rounds this season to display.
      </div>
    </div>
  );
  return(
    <div>
      <div className="card-title" style={{marginBottom:5}}>Handicap Index vs Avg Performance</div>
      <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:12}}>Higher scores for a given HCP = outperforming handicap. Tap a dot for name.</p>
      <ChartCanvas config={config} deps={[scatterData.length,scatterData.map((d:any)=>d.golfer.golfer_id).join()]} height={270}/>
    </div>
  );
}
function GolferHistoryChart({golfer,rounds,seasonData,leaderboard,golfers,seasonEvents}:any){
  const avg=rounds.reduce((s:number,r:any)=>s+r.pts,0)/rounds.length;
  const best=Math.max(...rounds.map((r:any)=>r.pts));
  const worst=Math.min(...rounds.map((r:any)=>r.pts));
  const totalEarned=rounds.reduce((s:number,r:any)=>s+r.earned,0);
  const netEarnings=totalEarned-(rounds.length*20);

  const histConfig = {
    type:"line" as const,
    data:{
      labels:rounds.map((_:any,i:number)=>"R"+(i+1)),
      datasets:[
        {label:"Points",data:rounds.map((r:any)=>r.pts),borderColor:"#1a7340",backgroundColor:"rgba(26,115,64,0.08)",pointBackgroundColor:"#1a7340",pointRadius:5,fill:true,tension:0.3},
        {label:"Avg",data:Array(rounds.length).fill(parseFloat(avg.toFixed(1))),borderColor:"#c47800",borderDash:[5,4],pointRadius:0,fill:false}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{
          label:(c:any)=>(c.dataset.label==="Avg" ? ("Avg: "+c.parsed.y.toFixed(1)) : (c.parsed.y+" pts")),
          title:(items:any)=>{const r=rounds[items[0].dataIndex];return formatDate(r.date)+" - "+r.course.split(" ")[0];}
        }}
      },
      scales:{
        x:{ticks:{color:"#6b5240",font:{size:12},maxTicksLimit:12},grid:{display:false}},
        y:{min:Math.max(0,worst-5),ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}}
      }
    }
  };

  // Running avg line for trend arrow
  // rounds is oldest-first; recent = last 2 entries, early = first 2 entries
  const trend=rounds.length>2?(rounds[rounds.length-1].pts+rounds[rounds.length-2].pts)/2-(rounds[0].pts+rounds[1].pts)/2:0;

  // -- Course breakdown --
  const courseBreakdown=(()=>{
    const map2:Record<string,{pts:number[],ranks:number[],players:number[]}>={}; 
    rounds.forEach((r:any)=>{
      if(!map2[r.course])map2[r.course]={pts:[],ranks:[],players:[]};
      map2[r.course].pts.push(r.pts);
      map2[r.course].ranks.push(r.rank);
      map2[r.course].players.push(r.players);
    });
    return Object.entries(map2).map(([course,d])=>({
      course:course.replace(" Golf Club","").replace("Golf Course",""),
      rounds:d.pts.length,
      avgPts:d.pts.reduce((a:number,b:number)=>a+b,0)/d.pts.length,
      avgRank:d.ranks.reduce((a:number,b:number)=>a+b,0)/d.ranks.length,
      avgField:d.players.reduce((a:number,b:number)=>a+b,0)/d.players.length,
    })).sort((a,b)=>b.avgPts-a.avgPts);
  })();

  // -- Rival & Twin --
  const rivalStats=(()=>{
    const gid=golfer.golfer_id;
    const opp:Record<number,{beats:number,loses:number,ties:number}>={};
    if(!leaderboard||!seasonEvents)return{rival:null,twin:null};
    seasonEvents.forEach((ev:any)=>{
      const mine=leaderboard.find((r:any)=>r.event_id===ev.event_id&&r.golfer_id===gid);
      if(!mine)return;
      leaderboard.filter((r:any)=>r.event_id===ev.event_id&&r.golfer_id!==gid&&r.buy_in_paid).forEach((o:any)=>{
        if(!opp[o.golfer_id])opp[o.golfer_id]={beats:0,loses:0,ties:0};
        if(o.total_stableford_points>mine.total_stableford_points)opp[o.golfer_id].beats++;
        else if(mine.total_stableford_points>o.total_stableford_points)opp[o.golfer_id].loses++;
        else opp[o.golfer_id].ties++;
      });
    });
    const ents=Object.entries(opp)
      .filter(([,v])=>(v.beats+v.loses+v.ties)>=2)
      .map(([id,v])=>({id:parseInt(id),...v,total:v.beats+v.loses+v.ties}));
    const rival=ents.length?[...ents].sort((a,b)=>(b.beats/b.total)-(a.beats/a.total))[0]:null;
    const twin=ents.filter(e=>e.ties>0).length?[...ents].sort((a,b)=>(b.ties/b.total)-(a.ties/a.total))[0]:null;
    const rG=rival?golfers.find((g:any)=>g.golfer_id===rival.id):null;
    const tG=twin?golfers.find((g:any)=>g.golfer_id===twin.id):null;
    return{rival:rG?{g:rG,...rival}:null,twin:(tG&&tG.golfer_id!==rG?.golfer_id)?{g:tG,...twin}:null};
  })();

  return(
    <div>
      {/* Stat hero cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div className="stat-card"><div className="stat-value" style={{fontSize:26}}>{avg.toFixed(1)}</div><div className="stat-label">Season Avg</div></div>
        <div className="stat-card"><div className="stat-value" style={{fontSize:26}}>{rounds.length}</div><div className="stat-label">Rounds Played</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)",fontSize:26}}>{best}</div><div className="stat-label">Best Round</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--red-600)",fontSize:26}}>{worst}</div><div className="stat-label">Worst Round</div></div>
      </div>

      {/* Earnings summary */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",padding:"12px",textAlign:"center"}}>
          <div style={{fontSize:22,fontWeight:700,color:"var(--green-700)"}}>${totalEarned.toFixed(0)}</div>
          <div style={{fontSize:12,color:"var(--text-muted)",fontWeight:500}}>Stableford Earned</div>
        </div>
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",padding:"12px",textAlign:"center"}}>
          <div style={{fontSize:22,fontWeight:700,color:netEarnings>=0?"var(--green-700)":"var(--red-600)"}}>{netEarnings>=0?"+$":"-$"}{Math.abs(netEarnings).toFixed(0)}</div>
          <div style={{fontSize:12,color:"var(--text-muted)",fontWeight:500}}>Net (−Entry Fees)</div>
        </div>
      </div>

      {/* Trend indicator */}
      {rounds.length>3&&(
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"10px 14px",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)"}}>
          <span style={{fontSize:20}}>{trend>0?"📈":trend<0?"📉":"➡️"}</span>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:trend>0?"var(--green-700)":trend<0?"var(--red-600)":"var(--text-muted)"}}>
              {trend>0?"Trending up":trend<0?"Trending down":"Holding steady"} {Math.abs(trend)>0.1?`(${trend>0?"+":""}${trend.toFixed(1)} pts recent vs early)`:""}</div>
            <div style={{fontSize:12,color:"var(--text-muted)"}}>Based on comparing first vs last rounds this season</div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--green-700)"}}>{golfer.first_name} {golfer.last_name} -- Round History</div>
        <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--text-muted)"}}>
          <span style={{width:14,height:3,background:"#1a7340",display:"inline-block",borderRadius:2}}></span>Pts
          <span style={{width:14,height:3,background:"#c47800",display:"inline-block",borderRadius:2,marginLeft:4}}></span>Avg
        </span>
      </div>
      <ChartCanvas config={histConfig} deps={[golfer.golfer_id,rounds.length]} height={210} style={{marginBottom:16}}/>



      {/* Course Breakdown */}
      {courseBreakdown.length>0&&(
        <div style={{marginTop:20}}>
          <div className="card-title" style={{marginBottom:8}}>Performance by Course</div>
          <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 48px 64px 72px",padding:"8px 12px",background:"var(--green-900)"}}>
              {["Course","Rds","Avg Pts","Avg Finish"].map((h:string,i:number)=>(
                <div key={i} style={{fontSize:11,fontWeight:700,color:"var(--gold-300)",letterSpacing:"0.06em",textTransform:"uppercase",textAlign:i>0?"center":"left"}}>{h}</div>
              ))}
            </div>
            {courseBreakdown.map((c:any,i:number)=>(
              <div key={c.course} style={{display:"grid",gridTemplateColumns:"1fr 48px 64px 72px",padding:"10px 12px",borderBottom:"1px solid var(--border)",background:i%2===1?"var(--surface2)":"transparent",alignItems:"center"}}>
                <div style={{fontSize:14,fontWeight:600}}>{c.course}</div>
                <div style={{textAlign:"center",fontSize:14,color:"var(--text-muted)"}}>{c.rounds}</div>
                <div style={{textAlign:"center",fontWeight:700,fontSize:16,color:"var(--green-700)"}}>{c.avgPts.toFixed(1)}</div>
                <div style={{textAlign:"center",fontSize:14}}>
                  {c.avgRank.toFixed(1)}<span style={{fontSize:11,color:"var(--text-muted)"}}>/{c.avgField.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rival & Twin */}
      {(rivalStats.rival||rivalStats.twin)&&(
        <div style={{marginTop:20,marginBottom:20}}>
          
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {rivalStats.rival&&(
              <div style={{background:"rgba(192,32,32,0.07)",border:"1.5px solid rgba(192,32,32,0.25)",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:700,color:"var(--red-600)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6}}>Rival</div>
                
                <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{rivalStats.rival.g.first_name} {rivalStats.rival.g.last_name}</div>
                <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                  Beats you {rivalStats.rival.beats}/{rivalStats.rival.total} events<br/>
                  <span style={{color:"var(--red-500)",fontWeight:600}}>{Math.round(rivalStats.rival.beats/rivalStats.rival.total*100)}% win rate vs you</span>
                </div>
              </div>
            )}
            {rivalStats.twin&&(
              <div style={{background:"rgba(26,115,64,0.07)",border:"1.5px solid rgba(26,115,64,0.25)",borderRadius:"var(--radius-md)",padding:"14px 12px",textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:700,color:"var(--green-700)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6}}>Twin</div>
               
                <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{rivalStats.twin.g.first_name} {rivalStats.twin.g.last_name}</div>
                <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                  Tied scores {rivalStats.twin.ties}/{rivalStats.twin.total} events<br/>
                  <span style={{color:"var(--green-600)",fontWeight:600}}>{Math.round(rivalStats.twin.ties/rivalStats.twin.total*100)}% match rate</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}    
      
            {/* Per-round table */}
            <div className="card-title" style={{marginBottom:8}}>Round-by-Round</div>
      <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:"var(--green-900)"}}>
              <th style={{color:"var(--gold-300)",padding:"9px 10px",textAlign:"left",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Date / Course</th>
              <th style={{color:"var(--gold-300)",padding:"9px 8px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Pts</th>
              <th style={{color:"var(--gold-300)",padding:"9px 8px",textAlign:"center",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Rank</th>
              <th style={{color:"var(--gold-300)",padding:"9px 10px",textAlign:"right",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>$</th>
            </tr>
          </thead>
          <tbody>
            {[...rounds].reverse().map((r:any,i:number)=>{
              const dt=new Date(r.date+"T00:00:00");
              const shortDate=dt.toLocaleDateString("en-US",{month:"short",day:"numeric"});
              const courseShort=r.course.replace(" Golf Club","").replace(" GC","").replace("Golf Course","").split(" ").slice(0,2).join(" ");
              return(
                <tr key={r.eid} style={{background:i%2===1?"var(--surface2)":undefined,borderBottom:"1px solid var(--border)"}}>
                  <td style={{padding:"10px 10px"}}>
                    <div style={{fontWeight:600,fontSize:15,color:"var(--text-primary)"}}>{shortDate}</div>
                    <div style={{fontSize:13,color:"var(--text-muted)",marginTop:1}}>{courseShort}</div>
                  </td>
                  <td style={{padding:"10px 8px",textAlign:"center",fontWeight:700,color:"var(--green-700)",fontSize:18}}>{r.pts}</td>
                  <td style={{padding:"10px 8px",textAlign:"center",fontSize:14,color:"var(--text-muted)"}}>{r.rank}<span style={{fontSize:11}}>/{r.players}</span></td>
                  <td style={{padding:"10px 10px",textAlign:"right",fontWeight:700,fontSize:15,color:r.earned>0?"var(--gold-600)":"var(--text-muted)"}}>{r.earned>0?`$${r.earned.toFixed(0)}`:"--"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        </div>
  
  )
}