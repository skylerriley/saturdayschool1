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
// Get these from: Supabase dashboard → Settings → API
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
  const fetchAll = async (table: string, cols = "*", orderCol = "created_at") => {
    // Primary key per table — used as a stable tiebreaker for pagination
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
      const url = `${SUPABASE_URL}/rest/v1/${table}?select=${cols}&order=${orderCol}.asc,${pk}.asc&limit=${PAGE}&offset=${from}`;
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
      select: (cols = "*") => fetchAll(table, cols),
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
  };
})();

// ============================================================
// CSS – DM Sans / DM Serif, larger accessible fonts
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

  /* Golf scorecard — score symbols */
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
// APP ROOT — Supabase connected
// ============================================================
export default function App(){
  // ── state ──────────────────────────────────────────────────
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
  const [successMsg,setSuccessMsg]=useState("");
  const [errorMsg,setErrorMsg]=useState("");

  // Lifted score-entry state — survives tab navigation
  const [scoreMode,setScoreMode]=useState("total");
  const [scoreEventId,setScoreEventId]=useState("");
  const [scorers,setScorers]=useState<any[]>([{golferId:"",courseId:"",totalPts:"",grossScores:Array(18).fill(""),submitted:false}]);

  const showSuccess=useCallback((msg:string)=>{setSuccessMsg(msg);setTimeout(()=>setSuccessMsg(""),3500);},[]);
  const showError=useCallback((msg:string)=>{setErrorMsg(msg);setTimeout(()=>setErrorMsg(""),5000);},[]);

  // ── initial load ────────────────────────────────────────────
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
        // Map DB column names → app field names
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

  // ── guest golfer listener ───────────────────────────────────
  useEffect(()=>{const h=(e:any)=>setGolfers(p=>[...p,e.detail]);window.addEventListener("addGolfer",h);return()=>window.removeEventListener("addGolfer",h);},[]);

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
        submitted:false
      };
    });
    if(restored.length)setScorers(restored);
  },[loading]);

  // ── DB write helpers ────────────────────────────────────────
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

  // Per-hole upsert used during live entry — on_conflict(summary_id,hole_number)
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

  // ── wrapped setters that also write to DB ──────────────────
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

  // Ref to track event inserts in-flight — prevents double-insert from
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
                  toInsert.forEach((s:any)=>dbUpsertSignup({...s,event_id:realId}));
                  return patched;
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
      // Don't sync signups whose event_id is still a temp value — they'll be
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

  // ── loading / error screens ─────────────────────────────────
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
            <button className="header-badge" style={{background:adminMode?"#c02020":undefined}} onClick={()=>setAdminMode(v=>!v)}>{adminMode?"Exit Admin":"Admin"}</button>
          </div>
          <nav className="nav-tabs">{tabs.map(t=><button key={t.id} className={`nav-tab${activeTab===t.id?" active":""}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>)}</nav>
        </header>
        <main className="main-content">
          {successMsg&&<div className="success-banner"><span>✓</span>{successMsg}</div>}
          {errorMsg&&<div style={{background:"var(--red-100)",border:"1px solid var(--red-400)",borderRadius:"var(--radius-md)",padding:"12px 16px",color:"var(--red-600)",fontSize:14,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span>⚠</span>{errorMsg}</div>}
          {activeTab==="leaderboard"&&<LeaderboardTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} holeScores={holeScores} signups={signups} adminMode={adminMode} showSuccess={showSuccess}/>}
          {activeTab==="rsvp"&&<RSVPTab golfers={golfers} courses={courses} events={events} signups={signups} setSignups={setSignupsDB} showSuccess={showSuccess} adminMode={adminMode}/>}
          {activeTab==="score"&&<ScoreEntryTab golfers={golfers} courses={courses} events={events} signups={signups} setSignups={setSignupsDB} leaderboard={leaderboard} setLeaderboard={setLeaderboardDB} holeScores={holeScores} setHoleScores={setHoleScoresDB} setEvents={setEventsDB} dbUpsertHoleScore={dbUpsertHoleScore} scoreMode={scoreMode} setScoreMode={setScoreMode} scoreEventId={scoreEventId} setScoreEventId={setScoreEventId} scorers={scorers} setScorers={setScorers} showSuccess={showSuccess}/>}
          {activeTab==="admin"&&adminMode&&<AdminTab golfers={golfers} setGolfers={setGolfersDB} courses={courses} setCourses={setCoursesDB} events={events} setEvents={setEventsDB} signups={signups} setSignups={setSignupsDB} leaderboard={leaderboard} setLeaderboard={setLeaderboardDB} holeScores={holeScores} setHoleScores={setHoleScoresDB} charityDonations={charityDonations} setCharityDonations={setCharityDB} showSuccess={showSuccess}/>}
          {activeTab==="analytics"&&<AnalyticsTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} signups={signups} holeScores={holeScores}/>}
        </main>
      </div>
    </>
  );
}

// ============================================================
// HELPERS – season data builder
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
function LeaderboardTab({golfers,courses,events,leaderboard,holeScores,signups,adminMode,showSuccess}:any){
  const [subTab,setSubTab]=useState("season");
  const [selEventId,setSelEventId]=useState<number|null>(null);
  const [expandedId,setExpandedId]=useState<number|null>(null);
  const [liveExpandedId,setLiveExpandedId]=useState<number|null>(null);
  const [showKappy,setShowKappy]=useState(false);

  // 1) Season selector — dropdown only, no "all time"
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

  // Check if skins are calculable for this event (all H×H)
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

  // Per-hole skin winner map: hole_number (1-based) → winning golfer_id
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

  // 1a) Show ALL golfers — exclude In-Progress rounds, flag <15 as unqualified
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
        <div className={`lb-row${isExpanded?" expanded":""}`} onClick={()=>{
          const willExpand=!isExpanded;
          setExpandedId(willExpand?gid:null);
          const isErrolClick=g&&g.first_name==="Errol"&&g.last_name==="Kaplan";
          const isWinnerClick=mode==="weekly"&&row.pos===1&&!row.tied;
          if(isErrolClick&&isWinnerClick&&willExpand){
            setShowKappy(true);
            setTimeout(()=>setShowKappy(false),3200);
          }
        }}>
          <div className={`lb-rank-cell ${rankClass}`} style={{fontSize:row.tied?16:22,fontWeight:700}}>{posLabel}</div>
          <div className="lb-name-cell">
            <div className="lb-name-main">{(()=>{
              if(!g)return"Unknown";
              // Easter egg: Errol Kaplan wins the weekly event → "Happy Kappy 😊" when expanded
              const isErrol=g.first_name==="Errol"&&g.last_name==="Kaplan";
              const isWeeklyWinner=mode==="weekly"&&row.pos===1&&!row.tied;
              if(isErrol&&isWeeklyWinner&&isExpanded)return"Happy Kappy 😊";
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
              :<div className="lb-thru-big" style={{color:weeklyEarned>0?"var(--gold-600)":"var(--text-muted)",fontSize:15}}>{weeklyEarned>0?`$${weeklyEarned.toFixed(0)}`:"—"}</div>
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
                    
                    <div className="lb-detail-item"><div className="lb-detail-key">Playing HCP</div><div className="lb-detail-val">{signup?.playing_handicap!=null?signup.playing_handicap:(g&&teePlayed?calcPlayingHandicap(g.current_handicap_index,teePlayed.tee_slope,teePlayed.tee_rating,teePlayed.par):"—")}</div></div>
                    <div className="lb-detail-item"><div className="lb-detail-key">Tees Played</div><div className="lb-detail-val">{teePlayed?.tee_box_name??"—"}</div></div>
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
                  {hbhScores.length===0&&<div style={{fontSize:13,color:"var(--text-muted)",fontStyle:"italic",marginTop:4}}>Total-only entry — no hole-by-hole data</div>}
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
                          <div style={{fontSize:18,textAlign:"left",marginLeft:5,fontWeight:600}}>{g?g.first_name+" "+g.last_name:"Unknown"}{row.isOnFire&&<span style={{marginLeft:5,fontSize:16}} title="On fire — 2+ consecutive holes of 3+ pts">🔥</span>}</div>
                          
                        </div>
                        <div style={{fontSize:20,fontWeight:700,color:"var(--green-700)",textAlign:"right"}}>{row.total_stableford_points||"—"}</div>
                        <div style={{fontSize:18,fontWeight:600,color:row.thru===18?"var(--green-600)":"var(--text-muted)",textAlign:"right"}}>
                          {row.thru===18?"F":row.thru||"—"}
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
              {seasonEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>)}
            </select>
          </div>
          {displayEvent&&(
            <>
              {!skinsEligible&&eventEntries.some((e:any)=>e.entry_type==="Total Only")&&(
                <div className="skins-warning"><span>⚠</span><span>Mixed entry — skins cannot be calculated until all players have hole-by-hole scores.</span></div>
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
            </>
          )}
        </>
      )}

    {/* ── Happy Kappy cascade ── */}
    {showKappy&&(()=>{
      const count=28;
      const items=Array.from({length:count},(_,i)=>{
        const left=2+Math.round(Math.random()*96);
        const delay=parseFloat((Math.random()*1.6).toFixed(2));
        const dur=parseFloat((1.4+Math.random()*0.9).toFixed(2));
        const size=20+Math.round(Math.random()*26);
        const rotate=Math.round((Math.random()-0.5)*40);
        return{i,left,delay,dur,size,rotate};
      });
      return(
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
          <style>{`
            @keyframes kappyFloat{
              0%  {transform:translateY(0px) rotate(var(--kr)) scale(0.6);opacity:0;}
              8%  {opacity:1;}
              85% {opacity:1;}
              100%{transform:translateY(-110vh) rotate(var(--kr)) scale(1.15);opacity:0;}
            }
            .kappy-e{
              position:absolute;
              bottom:-40px;
              line-height:1;
              animation:kappyFloat var(--kd)s ease-out var(--kdl)s both;
              pointer-events:none;
              user-select:none;
            }
          `}</style>
          {items.map(e=>(
            <span
              key={e.i}
              className="kappy-e"
              style={{
                left:e.left+"%",
                fontSize:e.size+"px",
                ["--kr" as any]:e.rotate+"deg",
                ["--kd" as any]:e.dur,
                ["--kdl" as any]:e.delay,
              }}
            >😊</span>
          ))}
        </div>
      );
    })()}
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
    setCharityDonations((p:any)=>[...p,{id:Date.now(),amount:parseFloat(newDonationAmt),note:newDonationNote||"Donation",date:new Date().toISOString().split("T")[0]}]);
    setNewDonationAmt(""); setNewDonationNote("");
    showSuccess("Charity donation recorded");
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
        <select style={{fontSize:13,padding:"4px 8px",border:"1.5px solid var(--border-md)",borderRadius:"var(--radius-sm)",fontFamily:"DM Sans,sans-serif",color:"var(--text-primary)"}} value={donationSeason} onChange={e=>setDonationSeason(e.target.value==="all"?"all":parseInt(e.target.value))}>
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
        <div key={d.id} className="info-row">
          <span className="info-key">{d.note}</span>
          <span style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>{d.date}</span>
            <span className="money">${Number(d.amount).toFixed(0)}</span>
          </span>
        </div>
      ))}
      <div className="card" style={{marginTop:10}}>
        <div className="card-title" style={{marginBottom:10}}>Add Donation</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Amount ($)</label><input className="form-input" type="number" min="0" placeholder="50" value={newDonationAmt} onChange={e=>setNewDonationAmt(e.target.value)}/></div>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Note</label><input className="form-input" placeholder="e.g. Birthday" value={newDonationNote} onChange={e=>setNewDonationNote(e.target.value)}/></div>
        </div>
        <button className="btn btn-primary btn-full" onClick={addDonation} disabled={!newDonationAmt}>Record Donation</button>
      </div>

      <hr className="divider"/>
      <div className="form-group">
        <label className="form-label">Event Breakdown</label>
        <select className="form-select" value={selEventId||""} onChange={e=>setSelEventId(parseInt(e.target.value))}>
          {[...events].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>)}
        </select>
      </div>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-value">${paidIn*20}</div><div className="stat-label">Stableford Pot</div></div>
        <div className="stat-card"><div className="stat-value">${skinsPaid*10}</div><div className="stat-label">Skins Pot</div></div>
        <div className="stat-card"><div className="stat-value">${entries.filter((e:any)=>e.charity_paid).length*5}</div><div className="stat-label">Charity This Event</div></div>
        <div className="stat-card"><div className="stat-value">${paidIn*20+skinsPaid*10+entries.filter((e:any)=>e.charity_paid).length*5}</div><div className="stat-label">Total Collected</div></div>
      </div>
      <div className="card-title" style={{marginBottom:8}}>Payout Detail</div>
      <table className="fin-table">
        <thead><tr><th>Golfer</th><th style={{textAlign:"right"}}>Stableford</th><th style={{textAlign:"right"}}>Skins</th><th style={{textAlign:"right"}}>Total</th></tr></thead>
        <tbody>
          {entries.filter((e:any)=>e.weekly_payout_won>0||e.skins_payout_won>0).map((e:any)=>(
            <tr key={e.summary_id}>
              <td>{golferName(golfers,e.golfer_id)}</td>
              <td style={{textAlign:"right"}} className="money">${Number(e.weekly_payout_won).toFixed(0)}</td>
              <td style={{textAlign:"right"}} className="money">${Number(e.skins_payout_won).toFixed(0)}</td>
              <td style={{textAlign:"right"}} className="money">${(Number(e.weekly_payout_won)+Number(e.skins_payout_won)).toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


// ============================================================
// WEATHER WIDGET  — Open-Meteo, free, no API key required
//
// GPS accuracy note: we use exact course coordinates rather than
// the ZIP 92612 centroid (~33.6459,-117.8428). The ZIP centroid
// is 2.5–3 miles from either course — at Open-Meteo's 1-2km
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
function RSVPTab({golfers,courses,events,signups,setSignups,showSuccess,adminMode}:any){
  const upcomingEvents=[...events].filter((e:any)=>e.status!=="Completed").sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  const [selEventId,setSelEventId]=useState<number>(upcomingEvents[0]?.event_id||0);
  const [subTab,setSubTab]=useState("rsvp");
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
    return`Saturday School – RSVP Reminder\n${formatDate(selEvent.date)} @ ${selEvent.course_name}\nTee times: ${selEvent.tee_times.join(", ")}\n\n✅ Going (${going.length}):\n${going.map((n:string)=>`  • ${n}`).join("\n")}\n\n❓ No response yet (${unconf.length}):\n${unconf.map((n:string)=>`  • ${n}`).join("\n")}\n\n❌ Not attending (${out.length}):\n${out.map((n:string)=>`  • ${n}`).join("\n")}\n\nPlease update your RSVP!`;
  };

  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);
  const mailtoLink=`mailto:?bcc=${allEmails.join(",")}&subject=Saturday School – RSVP Reminder ${formatDate(selEvent?.date)}&body=${encodeURIComponent(buildReminderBody())}`;

  // Pairing view
  const pairingsByTee = selEvent?.tee_times
    ?selEvent.tee_times.map((tt:string)=>({teeTime:tt,players:eventSignups.filter((s:any)=>s.assigned_tee_time===tt&&s.attending==="Yes")}))
    :[];
  const hasPairings=pairingsByTee.some((g:any)=>g.players.length>0);

  if(upcomingEvents.length===0)return<div className="empty-state"><div className="empty-text">No upcoming events</div></div>;

  return(
    <div>
      <div className="section-title">Sign Up</div>
      <div className="section-sub">RSVP for upcoming rounds</div>

      <div className="form-group">
        <label className="form-label">Select Event</label>
        <select className="form-select" value={selEventId} onChange={e=>setSelEventId(parseInt(e.target.value))}>
          {upcomingEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>)}
        </select>
      </div>

      {/* Event summary card — status, tee times, and inline weather row */}
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

      {/* #3b – two sub-tabs: RSVP | View Pairings */}
      <div className="toggle-group">
        <button className={`toggle-btn${subTab==="rsvp"?" active":""}`} onClick={()=>setSubTab("rsvp")}>RSVP</button>
        <button className={`toggle-btn${subTab==="pairings"?" active":""}`} onClick={()=>setSubTab("pairings")}>View Pairings</button>
      </div>

      {subTab==="rsvp"&&(
        <>
          <div className="card-title" style={{marginBottom:10}}>Member RSVPs</div>
          {eventSignups.filter((s:any)=>!s.is_guest_entry).map((signup:any)=>{
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
              <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:10}}>Emails the full group with current RSVP status — includes tee time schedule.</p>
              <a href={mailtoLink} className="btn btn-outline btn-full" style={{textDecoration:"none"}}>✉ Send RSVP Reminder</a>
            </>
          )}
        </>
      )}

      {subTab==="pairings"&&(
        <>
          {!hasPairings
            ?<div className="empty-state"><div className="empty-text">Pairings not yet set</div><div className="empty-sub">Check back after the admin runs the pairing engine</div></div>
            :pairingsByTee.filter((g:any)=>g.players.length>0).map((group:any,i:number)=>(
              <div key={i} className="pairing-card">
                <div className="pairing-header">
                  <span className="pairing-time">⏱ {group.teeTime}</span>
                  <span className="pairing-group">Group {i+1} · {group.players.length} players</span>
                </div>
                <div className="pairing-body">
                  {group.players.map((su:any)=>{
                    const g=golfers.find((x:any)=>x.golfer_id===su.golfer_id);
                    return(
                      <div key={su.signup_id} className="pairing-player">
                        <div>
                          <span style={{fontWeight:500}}>{g?`${g.first_name} ${g.last_name}`:"Guest"}</span>
                          {su.is_guest_entry&&<span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px",marginLeft:6,color:"var(--gold-800)"}}>guest</span>}
                        </div>
                        <span className="pairing-hcp" style={{color:"var(--text-muted)",fontSize:13}}>HCP {g?.current_handicap_index?.toFixed(1)??""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          }
        </>
      )}
    </div>
  );
}

// ============================================================
// SCORE ENTRY  (#4a up to 4 golfers at once, #5a skins warning)
// ============================================================
const emptyScorer=()=>({golferId:"",courseId:"",totalPts:"",grossScores:Array(18).fill(""),submitted:false});

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

  const updateScorer=(idx:number,field:string,val:any)=>{
    setScorers(p=>{
      const updated=p.map((s,i)=>i===idx?{...s,[field]:val}:s);

      // When a golfer is selected in H×H mode, auto-restore their in-progress round
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
    // ── Step 1: update React state immediately so UI is responsive ──
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

    // ── Step 2: update holeScores state for LIVE scorecard ──
    const existing=leaderboard.find((r:any)=>r.event_id===eid&&r.golfer_id===gid);
    // Only update local holeScores state if we have a real (DB-persisted) summary_id.
    // If no entry exists yet we'll write to DB first and patch state in the callback.
    if(existing?.summary_id&&existing.summary_id<1e12){
      const sid=existing.summary_id;
      if(val&&!isNaN(grossVal)){
        const net=calcHoleNetScore(grossVal,phcp,course.hole_stroke_indices[hole]);
        const pts=calcStablefordPoints(net,course.hole_pars[hole]);
        const holeRow={score_id:sid*100+hole,summary_id:sid,hole_number:hole+1,gross_score:grossVal,net_score:net,stableford_points:pts};
        setHoleScores((hs:any)=>[...hs.filter((h:any)=>!(h.summary_id===sid&&h.hole_number===hole+1)),holeRow]);
        if(dbUpsertHoleScore) dbUpsertHoleScore(holeRow);
      } else if(!val){
        setHoleScores((hs:any)=>hs.filter((h:any)=>!(h.summary_id===sid&&h.hole_number===hole+1)));
      }
    }

    // ── Step 3: update leaderboard running total state ──
    const tempSid:number=existing?.summary_id||(Date.now()+gid);
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

    // ── Step 4: flip event to In-Progress ──
    setEvents((evs:any)=>evs.map((ev:any)=>
      ev.event_id===eid&&ev.status==="Pairings Set"?{...ev,status:"In-Progress"}:ev
    ));

    // ── Step 5: DB writes — correct sequence ──
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

    const pendingKey=eid+":"+gid;

    if(!existing||existing.summary_id>=1e12){
      // ── No real DB row yet ──
      if(pendingLbInsert.current[pendingKey]){
        // Insert already in-flight — queue this hole for when it resolves
        const capturedGross=[...newGross];
        pendingLbInsert.current[pendingKey].push(async(realId:number)=>{
          const net=val&&!isNaN(grossVal)?calcHoleNetScore(grossVal,phcp,course.hole_stroke_indices[hole]):null;
          const pts=net!=null?calcStablefordPoints(net,course.hole_pars[hole]):null;
          if(net!=null&&pts!=null){
            const payload={summary_id:realId,hole_number:hole+1,gross_score:grossVal,net_score:net,stableford_points:pts};
            await supabase.from("hole_scores").upsert(payload,"summary_id,hole_number");
          }
          // Also update the running total now that we have all holes
          const finalCalcs=calcHoleScores(capturedGross,phcp,course);
          const finalPts=finalCalcs.reduce((s:number,h:any)=>s+(h.points??0),0);
          const {summary_id:__,created_at:___,...lbUpd}={...liveEntry,total_stableford_points:finalPts};
          supabase.from("event_leaderboard").update({...lbUpd,summary_id:realId},{summary_id:realId}).catch(()=>{});
        });
        return;
      }
      // Mark insert as in-flight
      pendingLbInsert.current[pendingKey]=[];
      const {summary_id:_,...lbRest}=liveEntry;
      supabase.from("event_leaderboard").insert(lbRest)
        .then(async(rows:any)=>{
          if(!rows||!rows[0])return;
          const realId:number=rows[0].summary_id;
          setLeaderboard((p:any)=>p.map((r:any)=>r.summary_id===tempSid?{...r,summary_id:realId}:r));
          setHoleScores((p:any)=>p.map((h:any)=>h.summary_id===tempSid?{...h,summary_id:realId}:h));
          await doHoleWrite(realId);
          doSignupWrite(realId);
          // Flush queued hole writes that arrived while insert was in-flight
          const queued=[...(pendingLbInsert.current[pendingKey]||[])];
          delete pendingLbInsert.current[pendingKey];
          for(const fn of queued) await fn(realId);
        })
        .catch(()=>{ delete pendingLbInsert.current[pendingKey]; });
    } else {
      // ── Leaderboard row already in DB — update and write hole directly ──
      const realSid=existing.summary_id;
      const {summary_id,created_at,...lbRest}=liveEntry;
      supabase.from("event_leaderboard").update({...lbRest,summary_id:realSid},{summary_id:realSid}).catch(()=>{});
      doHoleWrite(realSid).catch(()=>{});
      doSignupWrite(realSid);
    }
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
        <button className={`toggle-btn${mode==="total"?" active":""}`} onClick={()=>setMode("total")}>Total Only</button>
        <button className={`toggle-btn${mode==="hole"?" active":""}`} onClick={()=>setMode("hole")}>Hole by Hole</button>
      </div>

      <div className="form-group">
        <label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value);setScorers([emptyScorer()]);}}>
          <option value="">Select event…</option>
          {activeEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>)}
        </select>
      </div>

      {/* Skins warning */}
      {/* Resume banner — shown when a prior H×H session is restored */}
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
            {mode==="total"&&(
              <div className="form-group" style={{marginBottom:0,marginTop:10}}>
                <label className="form-label">Stableford Points</label>
                <input className="form-input" type="number" min="0" max="72" placeholder="e.g. 36" value={scorer.totalPts} onChange={e=>updateScorer(idx,"totalPts",e.target.value)}/>
              </div>
            )}
          </div>
        );
      })}

      {/* 3: Unified stacked H×H table — one row per hole, one column per golfer */}
      {mode==="hole"&&selEvent&&scorers.some(s=>s.golferId&&s.courseId)&&(()=>{
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
                    <tr key={holeIdx}>
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

      {selEvent&&scorers.length<4&&(
        <button className="btn btn-outline btn-full" style={{marginBottom:12}} onClick={addScorer}>+ Add Another Golfer ({scorers.length}/4)</button>
      )}

      <button className="btn btn-primary btn-full" disabled={!selEventId||!canSubmit} onClick={handleSubmitAll} style={{marginTop:4}}>
        Submit {scorers.filter(s=>s.golferId&&s.courseId).length>1?`${scorers.filter(s=>s.golferId&&s.courseId).length} Scores`:"Score"}
      </button>
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

// ── 3a) GOLFER ROSTER ────────────────────────────────────────
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
  };

  const startEdit=(g:any)=>{
    setEditId(g.golfer_id);
    setForm({first_name:g.first_name,last_name:g.last_name,email_address:g.email_address||"",current_handicap_index:String(g.current_handicap_index),season_fee_paid:!!g.season_fee_paid});
  };

  const toggleStatus=(id:number,cur:string)=>{
    setGolfers((p:any)=>p.map((g:any)=>g.golfer_id===id?{...g,status:cur==="Active"?"Inactive":"Active"}:g));
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

// ── 3b) COURSE MANAGER ───────────────────────────────────────
function CourseManager({courses,setCourses,showSuccess}:any){
  const blank:any={course_id:0,course_name:"",tee_box_name:"",tee_slope:113,tee_rating:72.0,par:72};
  const [editing,setEditing]=useState<any|null>(null);
  const [form,setForm]=useState<any>(blank);
  const [parStr,setParStr]=useState("4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,4");
  const [siStr,setSiStr]=useState("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18");
  const courseNames=[...new Set(courses.map((c:any)=>c.course_name))] as string[];

  const startNew=()=>{setEditing("new");setForm(blank);setParStr("4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,4");setSiStr("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18");};
  const startEdit=(c:any)=>{setEditing(c.course_id);setForm({...c});setParStr(c.hole_pars.join(","));setSiStr(c.hole_stroke_indices.join(","));};

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
  };

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div className="card-title">Course & Tee Manager</div>
        <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add Tee</button>
      </div>

      {editing&&(
        <div className="card" style={{marginBottom:14}}>
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
              <button className="btn btn-sm btn-danger" onClick={()=>{setCourses((p:any)=>p.filter((x:any)=>x.course_id!==c.course_id));showSuccess("Tee removed");}}>Del</button>
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
    showSuccess(`Score corrected: ${golferName(golfers,parseInt(selGolferId))} → ${pts} pts`);
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

      {/* 2b: Year filter — only current year is editable */}
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
          {filteredEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>)}
        </select>
      </div>
      {selEventId&&(
        <div className="form-group"><label className="form-label">Golfer</label>
          <select className="form-select" value={selGolferId} onChange={e=>setSelGolferId(e.target.value)}>
            <option value="">Select golfer…</option>
            {leaderboard.filter((r:any)=>r.event_id===parseInt(selEventId)).map((r:any)=>{
              const g=golfers.find((x:any)=>x.golfer_id===r.golfer_id);
              return<option key={r.golfer_id} value={r.golfer_id}>{g?`${g.first_name} ${g.last_name}`:"Unknown"} — {r.total_stableford_points} pts ({r.entry_type})</option>;
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
                {availTees.map((t:any)=><option key={t.course_id} value={t.course_id}>{t.tee_box_name} — Slope {t.tee_slope}</option>)}
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
  const handleSave=()=>{setGolfers((p:any)=>p.map((g:any)=>edits[g.golfer_id]!==undefined?{...g,current_handicap_index:parseFloat(edits[g.golfer_id])||g.current_handicap_index}:g));setEdits({});showSuccess("Handicap indices updated");};
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
      "<h3 style=\"background:#2d6e45;color:white;margin:0;padding:10px 18px;font-size:15px;font-weight:400;\">Playing Handicaps — "+selCourseName+"</h3>" +
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
        showSuccess("Could not access clipboard — try on a different browser");
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
                    <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Step 1 — Copy the table</div>
                    <p style={{fontSize:14,color:"var(--text-primary)",marginBottom:12,lineHeight:1.5}}>
                      Copies a formatted HTML table to your clipboard. When you paste it into Gmail or Outlook it will look like a proper table with colors.
                    </p>
                    <button className={copied?"btn btn-primary btn-full":"btn btn-outline btn-full"} onClick={handleCopy} style={{fontWeight:700}}>
                      {copied?"✅ Copied to clipboard!":"📋 Copy Formatted Table"}
                    </button>
                  </div>

                  {/* Step 2: Open email */}
                  <div style={{background:"var(--surface2)",borderRadius:"var(--radius-md)",padding:16,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Step 2 — Compose &amp; paste</div>
                    <p style={{fontSize:14,color:"var(--text-primary)",marginBottom:12,lineHeight:1.5}}>
                      Open your email app, start a new message to the group, then paste (<strong>Ctrl+V</strong> / <strong>⌘V</strong>) into the body. The table will appear with full formatting.
                    </p>
                    <div style={{background:"var(--green-50)",border:"1px solid var(--green-200)",borderRadius:"var(--radius-md)",padding:"10px 12px",fontSize:13,color:"var(--green-800)"}}>
                      <strong>Suggested subject:</strong> Saturday School – Playing Handicaps ({selCourseName})
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
  };

  const deleteEvent=(evId:number,evDate:string)=>{
    if(!window.confirm(`Delete event on ${formatDate(evDate)}? This cannot be undone.`))return;
    setEvents((p:any)=>p.filter((e:any)=>e.event_id!==evId));
    setSignups((p:any)=>p.filter((s:any)=>s.event_id!==evId));
    showSuccess("Event deleted");
  };

  const currentYear=new Date().getFullYear();
  const allSeasonsList=[...new Set(events.map((e:any)=>e.season))].sort((a:any,b:any)=>b-a) as number[];
  const [filterSeason,setFilterSeason]=useState<number|"all">(allSeasonsList[0]||currentYear);
  const sortedEvents=[...events].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);
  const filteredEvents=filterSeason==="all"?sortedEvents:sortedEvents.filter((e:any)=>e.season===filterSeason);

  return(
    <div>
      <div className="card-title" style={{marginBottom:12}}>{editId?"Edit Event":"Create New Event"}</div>
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
      <a href={`mailto:?bcc=${allEmails.join(",")}&subject=Saturday School – Upcoming Round&body=Hi all, join us for our next Saturday round. Please RSVP on the app!`} className="btn btn-outline btn-full" style={{textDecoration:"none",display:"flex",marginBottom:20}}>✉ Send Invitation</a>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div className="card-title">All Events</div>
        <select style={{fontSize:13,padding:"4px 8px",border:"1.5px solid var(--border-md)",borderRadius:"var(--radius-sm)",fontFamily:"DM Sans,sans-serif",color:"var(--text-primary)"}} value={filterSeason} onChange={e=>setFilterSeason(e.target.value==="all"?"all":parseInt(e.target.value))}>
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

  const buildBody=()=>{
    if(!pairings||!selEvent)return"";
    let b=`Saturday School – Pairings\n${formatDate(selEvent.date)} @ ${selEvent.course_name}\n\n`;
    pairings.forEach((g:any,i:number)=>{
      b+=`Group ${i+1} – Tee: ${g.teeTime}\n`;
      g.players.forEach((gid:number)=>{
        const gl=golfers.find((x:any)=>x.golfer_id===gid);
        b+=`  • ${gl?.first_name} ${gl?.last_name}${gl?.is_guest?" (Guest)":""}\n`;
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
          {events.filter((e:any)=>e.status!=="Completed").map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>)}
        </select>
      </div>
      {selEvent&&<div className="card" style={{padding:"10px 14px",marginBottom:12}}>
        <div className="info-row"><span className="info-key">Confirmed players</span><span className="info-val" style={{color:"var(--green-700)",fontWeight:700}}>{eventSignups.length}</span></div>
        <div className="info-row"><span className="info-key">Tee times</span><span className="info-val">{selEvent.tee_times.join(" · ")}</span></div>
        <div className="info-row"><span className="info-key">Status</span><span className="pill pill-gold">{selEvent.status}</span></div>
      </div>}
      <button className="btn btn-gold btn-full" onClick={runPairings} disabled={!selEvent||eventSignups.length<2}>🎲 {confirmed?"Re-generate Pairings":"Generate Pairings"}</button>

      {pairings&&(
        <div style={{marginTop:14}}>
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
                <span className="pairing-group">Group {i+1} · {group.players.length} players{moving&&moving.fromGroup!==i?" — tap to move here":""}</span>
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
            <a href={`mailto:?bcc=${allEmails.join(",")}&subject=Saturday School Pairings – ${formatDate(selEvent?.date)}&body=${encodeURIComponent(buildBody())}`} className="btn btn-outline" style={{flex:1,textDecoration:"none"}}>✉ Email</a>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANALYTICS TAB — rich dashboard
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

  const SUBTABS=[{id:"overview",label:"Overview"},{id:"odds",label:"Odds"},{id:"consistency",label:"Consistency"},{id:"golfer",label:"My Rounds"},{id:"course",label:"By Course"},{id:"scatter",label:"HCP vs Pts"}];

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
      {subTab==="course"&&<CourseChart courseAvgs={courseAvgs}/>}
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
          {selG&&golferRounds.length>0&&<GolferHistoryChart golfer={selG} rounds={golferRounds} seasonData={selGData}/>}
          {selG&&golferRounds.length===0&&<div className="empty-state"><div className="empty-text">No rounds recorded this season</div></div>}
        </>
      )}
      {subTab==="odds"&&<OddsTab golfers={golfers} leaderboard={leaderboard} events={events} signups={signups} courses={courses} holeScores={holeScores} season={selSeason}/>}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// ODDS ENGINE
// ══════════════════════════════════════════════════════════════════
//
// FORMULAS USED (documented here for transparency)
//
// ── Per-golfer profile ──────────────────────────────────────────
//
// 1. WEIGHTED AVERAGE (decay factor d=0.88 per round going back)
//    weightedAvg = Σ(score_i × d^i) / Σ(d^i)
//    where i=0 is the most recent round. d=0.88 means each prior
//    round is worth 88% of the next more-recent round.
//
// 2. STANDARD DEVIATION (consistency)
//    σ = sqrt( Σ(score_i - mean)² / n )
//    Lower σ = more consistent = lower variance in projection.
//
// 3. TREND (slope of linear regression over last N rounds)
//    Using least-squares slope: b = (n·Σxy - Σx·Σy) / (n·Σx² - (Σx)²)
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
//    where playing_handicap is recorded. Rising HCP → harder to score
//    → subtract up to 1.0 pt from projection. Falling HCP → easier.
//    hcpTrendAdj = (hcpTrendSlope * -0.3), clamped to [-1.0, +1.0]
//
// 6. PROJECTED SCORE
//    proj = weightedAvg + (trend × 0.5) + courseAdj + hcpTrendAdj
//    Clamped to [max(0, globalMin-2), globalMax+2]
//
// ── Win probability ─────────────────────────────────────────────
//
// 7. RAW WIN PROBABILITY via Monte Carlo simulation (N=5000 trials)
//    Each trial: draw a score for every playing golfer from
//    Normal(proj_i, σ_i). Winner = highest draw.
//    rawWinProb_i = wins_i / N
//
// 8. HOUSE EDGE (3% vigorish)
//    The sum of all raw win probs = 1.0 (zero-sum).
//    We apply vig by scaling: adjProb_i = rawWinProb_i / (1 + VIG)
//    This creates a ~3% book margin.
//
// 9. AMERICAN ODDS from probability p
//    If p >= 0.5:  odds = round(-(p / (1-p)) × 100)   → negative (favorite)
//    If p < 0.5:   odds = round(((1-p) / p) × 100)    → positive (underdog)
//
// ── Head-to-head ────────────────────────────────────────────────
//
// 10. H2H WIN PROBABILITY
//     When both golfers have played the same event, track who scored higher.
//     h2hRecord = { wins_A, wins_B, ties }
//     h2hAdj: weight recent matchups (d=0.85 per prior event)
//     h2hBaseProb_A = weightedH2HWins_A / (weightedH2HWins_A + weightedH2HWins_B)
//     Blend 60% Monte Carlo projection, 40% historical H2H:
//     finalProb_A = 0.60 × monteCarloProb_A + 0.40 × h2hBaseProb_A
//     (Falls back to 100% Monte Carlo if <3 shared events)
//
// 11. SPREAD (point differential projection)
//     spread = projA - projB  (positive = A favored by that margin)
//     spreadSigma = sqrt(σA² + σB²)   (combined uncertainty)
//     Spread odds: favorite at -110, underdog at +100 (standard -10 vig line)
//     For ties/pushes: if |spread| < 0.5, display "Pick'em"
//
// ══════════════════════════════════════════════════════════════════

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
  // Rising HCP = harder to score = negative adjustment (capped ±1.0)
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
  if(shared.length<3)return projProbA; // not enough H2H — use projection only
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

// ══════════════════════════════════════════════════════════════════
// ODDS TAB COMPONENT
// ══════════════════════════════════════════════════════════════════

// ── H2H Hole-by-Hole helpers ──────────────────────────────────

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
  const upcomingEvents=events.filter((e:any)=>e.status==="Upcoming"||e.status==="Pairings Set"||e.status==="In-Progress");
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

      {/* Event selector (shared) */}
      <div className="form-group">
        <label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value);setExcludedIds(new Set());}}>
          {allEventsSorted.map((ev:any)=>(
            <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name} {ev.status==="Completed"?"(final)":""}</option>
          ))}
        </select>
      </div>

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
                          {r.rounds} rds · σ{r.sd} {r.trend>0.05?"↑ hot":r.trend<-0.05?"↓ cooling":"→ steady"}
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
                  ⚠ No scoring history: {noHistoryGolfers.map((g:any)=>g.first_name).join(", ")} — excluded from odds calculation
                </div>
              )}

              

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
                        <div style={{fontWeight:aWins?700:400,fontSize:15,color:aWins?"var(--green-700)":"var(--text-primary)"}}>{row.a}</div>
                        <div style={{fontSize:11,color:"var(--text-muted)",textAlign:"center",padding:"0 8px",letterSpacing:"0.04em"}}>{row.label}</div>
                        <div style={{fontWeight:bWins?700:400,fontSize:15,color:bWins?"var(--green-700)":"var(--text-primary)",textAlign:"right"}}>{row.b}</div>
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
                            <div style={{fontSize:13}}>{formatDate(r.date)}</div>
                            <div style={{textAlign:"center",fontWeight:winner==="A"?700:400,fontSize:14,color:winner==="A"?"var(--green-700)":"var(--text-muted)"}}>{r.ptsA}</div>
                            <div style={{textAlign:"center",fontWeight:winner==="B"?700:400,fontSize:14,color:winner==="B"?"var(--green-700)":"var(--text-muted)"}}>{r.ptsB}</div>
                            <div style={{textAlign:"center",fontSize:13,fontWeight:600,color:winner==="T"?"var(--text-muted)":winner==="A"?"var(--green-700)":"var(--gold-700)"}}>
                              {winner==="T"?"TIE":winner==="A"?gA.first_name[0]:gB.first_name[0]}
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
                    ℹ️ {h2hShared.length} shared event{h2hShared.length!==1?"s":""} on record. H2H blending activates at 3+ shared events — using projection model only.
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
                        :"Estimated from total Stableford scores — weighted by hole difficulty (stroke index)."
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
                                    {Math.abs(diff)<0.05?"—":favA?gA?.first_name[0]:gB?.first_name[0]}
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
                                    {Math.abs(diff)<0.05?"—":favA?gA?.first_name[0]:gB?.first_name[0]}
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
                    No shared events yet — hole-by-hole breakdown requires at least 1 shared event.
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
            <div className="empty-state"><div className="empty-text">One or both golfers have no scoring history — can't calculate odds yet</div></div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Season Overview Dashboard ─────────────────────────────────
function SeasonOverview({seasonData,seasonEvents,season,leaderboard,golfers}:any){
  const totalRounds=seasonData.reduce((s:number,d:any)=>s+d.rounds,0);
  const allPts=seasonData.flatMap((d:any)=>d.allPts);
  const seasonAvg=allPts.length?allPts.reduce((a:number,b:number)=>a+b,0)/allPts.length:0;
  const highScoreEntry=allPts.length?Math.max(...allPts):0;
  const highScorer=seasonData.find((d:any)=>d.best===highScoreEntry);
  const winLeader=seasonData.length?[...seasonData].sort((a:any,b:any)=>b.wins-a.wins)[0]:null;

  // Win tally — bar chart data
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

// ── Consistency (Std Dev) Table ───────────────────────────────
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
                <td style={{padding:"11px 6px",textAlign:"center",color:"var(--text-muted)",fontSize:15}}>{r.best}–{r.worst}</td>
                <td style={{padding:"11px 8px",textAlign:"center",color:"var(--text-muted)",fontSize:15}}>{r.rounds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CourseChart({courseAvgs}:any){
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
  return(
    <div>
      <div className="card-title" style={{marginBottom:4}}>Stableford Averages by Course</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>Field average stableford points per course this season.</p>
      {courseAvgs.map((c:any)=><div key={c.name} className="info-row"><span className="info-key">{c.name}</span><span className="info-val">{c.count>0?(c.avg.toFixed(1)+" pts avg ("+c.count+" rounds)"):"No data"}</span></div>)}
      <ChartCanvas config={config} deps={[courseAvgs.length,courseAvgs.map((c:any)=>c.avg).join()]} height={210} style={{marginTop:16}}/>
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
function GolferHistoryChart({golfer,rounds,seasonData}:any){
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
  const trend=rounds.length>2?(rounds[rounds.length-1].pts+rounds[rounds.length-2].pts)/2 - (rounds[0].pts+rounds[1].pts)/2:0;

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

      {/* Chart */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--green-700)"}}>{golfer.first_name} {golfer.last_name} — Round History</div>
        <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--text-muted)"}}>
          <span style={{width:14,height:3,background:"#1a7340",display:"inline-block",borderRadius:2}}></span>Pts
          <span style={{width:14,height:3,background:"#c47800",display:"inline-block",borderRadius:2,marginLeft:4}}></span>Avg
        </span>
      </div>
      <ChartCanvas config={histConfig} deps={[golfer.golfer_id,rounds.length]} height={210} style={{marginBottom:16}}/>

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
            {rounds.map((r:any,i:number)=>{
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
                  <td style={{padding:"10px 10px",textAlign:"right",fontWeight:700,fontSize:15,color:r.earned>0?"var(--gold-600)":"var(--text-muted)"}}>{r.earned>0?`$${r.earned.toFixed(0)}`:"—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}