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