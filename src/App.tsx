import { useState, useEffect, useCallback } from "react";

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

  /* ── SCORE GRID ── */
  .score-grid{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}
  .score-table{min-width:300px;border-collapse:collapse;font-size:14px;width:100%;}
  .score-table th{background:var(--green-900);color:var(--gold-300);font-size:12px;font-weight:700;letter-spacing:0.06em;padding:8px 5px;text-align:center;white-space:nowrap;}
  .score-table td{padding:8px 4px;text-align:center;border-bottom:1px solid var(--border);font-size:14px;}
  .score-table tr:nth-child(even) td{background:var(--surface2);}
  .score-input-cell input{width:40px;padding:5px 2px;text-align:center;border:1.5px solid var(--border-md);border-radius:5px;font-size:15px;font-family:'DM Sans',sans-serif;}
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
  .rsvp-row{display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border);gap:8px;}
  .rsvp-row:last-child{border-bottom:none;}
  .rsvp-name{font-size:16px;font-weight:500;flex:1;min-width:0;}
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
function calcHoleNetScore(gross:number,phcp:number,si:number){const b=Math.floor(phcp/18),e=phcp%18;return gross-b-(si<=e?1:0);}
function calcStablefordPoints(net:number,par:number){const d=net-par;if(d<=-2)return 4;if(d===-1)return 3;if(d===0)return 2;if(d===1)return 1;return 0;}
function calcHoleScores(grossScores:any[],phcp:number,course:any){
  return grossScores.map((g,i)=>{
    const gross=g?parseInt(String(g)):null;
    if(!gross)return{gross:null,net:null,points:null};
    const net=calcHoleNetScore(gross,phcp,course.hole_stroke_indices[i]);
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
// APP ROOT
// ============================================================
export default function App(){
  const [golfers,setGolfers]=useState(INITIAL_GOLFERS);
  const [courses]=useState(INITIAL_COURSES);
  const [events,setEvents]=useState(INITIAL_EVENTS);
  const [signups,setSignups]=useState(INITIAL_SIGNUPS);
  const [leaderboard,setLeaderboard]=useState(INITIAL_LEADERBOARD);
  const [holeScores,setHoleScores]=useState(INITIAL_HOLE_SCORES);
  const [charityDonations,setCharityDonations]=useState(INITIAL_CHARITY_DONATIONS);
  const [activeTab,setActiveTab]=useState("leaderboard");
  const [adminMode,setAdminMode]=useState(false);
  const [successMsg,setSuccessMsg]=useState("");

  const showSuccess=useCallback((msg:string)=>{setSuccessMsg(msg);setTimeout(()=>setSuccessMsg(""),3500);},[]);

  // Listen for guest golfer additions
  useEffect(()=>{const h=(e:any)=>setGolfers(p=>[...p,e.detail]);window.addEventListener("addGolfer",h);return()=>window.removeEventListener("addGolfer",h);},[]);

  const tabs=adminMode
    ?[{id:"leaderboard",label:"Leaderboard"},{id:"rsvp",label:"Sign Up"},{id:"score",label:"Scoring"},{id:"admin",label:"⚙ Admin"},{id:"analytics",label:"Analytics"}]
    :[{id:"leaderboard",label:"Leaderboard"},{id:"rsvp",label:"Sign Up"},{id:"score",label:"Scoring"},{id:"analytics",label:"Analytics"}];

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
          {activeTab==="leaderboard"&&<LeaderboardTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} holeScores={holeScores} signups={signups} adminMode={adminMode} charityDonations={charityDonations} setCharityDonations={setCharityDonations} showSuccess={showSuccess}/>}
          {activeTab==="rsvp"&&<RSVPTab golfers={golfers} events={events} signups={signups} setSignups={setSignups} showSuccess={showSuccess} adminMode={adminMode}/>}
          {activeTab==="score"&&<ScoreEntryTab golfers={golfers} courses={courses} events={events} signups={signups} leaderboard={leaderboard} setLeaderboard={setLeaderboard} holeScores={holeScores} setHoleScores={setHoleScores} setEvents={setEvents} showSuccess={showSuccess}/>}
          {activeTab==="admin"&&adminMode&&<AdminTab golfers={golfers} setGolfers={setGolfers} courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} leaderboard={leaderboard} showSuccess={showSuccess}/>}
          {activeTab==="analytics"&&<AnalyticsTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard}/>}
        </main>
      </div>
    </>
  );
}

// ============================================================
// HELPERS – season data builder
// ============================================================
function buildSeasonRounds(golfers:any[],leaderboard:any[],season:number|"all"){
  const byG:Record<number,number[]>={};
  leaderboard.forEach((r:any)=>{
    if(season!=="all"&&r.season!==season)return;
    const g=golfers.find((x:any)=>x.golfer_id===r.golfer_id);
    if(!g||g.is_guest)return;
    (byG[r.golfer_id]=byG[r.golfer_id]||[]).push(r.total_stableford_points);
  });
  Object.entries(EXTRA_ROUNDS_BY_GOLFER).forEach(([gid,rounds])=>{
    const id=parseInt(gid);
    const g=golfers.find((x:any)=>x.golfer_id===id);
    if(!g||g.is_guest)return;
    rounds.forEach(r=>{if(season==="all"||r.season===season)(byG[id]=byG[id]||[]).push(r.pts);});
  });
  return byG;
}

function golferStats(golfers:any[],leaderboard:any[],gid:number,season:number|"all"){
  const entries=leaderboard.filter((r:any)=>r.golfer_id===gid&&(season==="all"||r.season===season));
  const extra=(EXTRA_ROUNDS_BY_GOLFER[gid]||[]).filter(r=>season==="all"||r.season===season).map(r=>r.pts);
  const allPts=[...entries.map((r:any)=>r.total_stableford_points),...extra];
  const wins=entries.filter((r:any)=>r.weekly_payout_won>0&&r.weekly_payout_won===Math.max(...leaderboard.filter((x:any)=>x.event_id===r.event_id).map((x:any)=>x.weekly_payout_won))).length;
  const seconds=entries.filter((r:any)=>{
    const evEntries=[...leaderboard.filter((x:any)=>x.event_id===r.event_id)].sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points);
    return evEntries[1]?.golfer_id===gid;
  }).length;
  const totalEarnings=entries.reduce((s:number,r:any)=>s+r.weekly_payout_won+r.skins_payout_won,0);
  return{rounds:allPts.length,avg:allPts.length?allPts.reduce((a,b)=>a+b,0)/allPts.length:0,best:allPts.length?Math.max(...allPts):0,worst:allPts.length?Math.min(...allPts):0,wins,seconds,totalEarnings};
}

// ============================================================
// LEADERBOARD TAB
// ============================================================
function LeaderboardTab({golfers,courses,events,leaderboard,holeScores,signups,adminMode,charityDonations,setCharityDonations,showSuccess}:any){
  const [subTab,setSubTab]=useState("season");
  const [selEventId,setSelEventId]=useState<number|null>(null);
  const [expandedId,setExpandedId]=useState<number|null>(null);

  // Season selector
  const allSeasons=[...new Set([...events.map((e:any)=>e.season),...leaderboard.map((r:any)=>r.season)])].sort((a,b)=>b-a);
  const [selSeason,setSelSeason]=useState<number|"all">(allSeasons[0]||2026);

  const completedEvents=[...events].filter((e:any)=>e.status==="Completed").sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const seasonEvents=selSeason==="all"?completedEvents:completedEvents.filter((e:any)=>e.season===selSeason);
  const displayEvent=selEventId?completedEvents.find((e:any)=>e.event_id===selEventId):seasonEvents[0];

  const eventEntries=displayEvent
    ?[...leaderboard.filter((e:any)=>e.event_id===displayEvent.event_id)].sort((a:any,b:any)=>b.total_stableford_points-a.total_stableford_points)
    :[];

  const paidEntries=eventEntries.filter((e:any)=>e.buy_in_paid);
  const totalPot=paidEntries.length*20;
  const first1stPts=paidEntries[0]?.total_stableford_points;
  const tied1st=paidEntries.filter((e:any)=>e.total_stableford_points===first1stPts);

  // Check if skins are calculable for this event (all H×H)
  const skinsEligible=eventEntries.length>0&&eventEntries.every((e:any)=>e.entry_type==="Hole-by-Hole");

  // Season avg
  const byG=buildSeasonRounds(golfers,leaderboard,selSeason);
  const seasonAvg=Object.entries(byG).filter(([,r])=>r.length>=15)
    .map(([gid,r])=>({golfer_id:parseInt(gid),avg:r.reduce((a,b)=>a+b,0)/r.length,rounds:r.length}))
    .sort((a,b)=>b.avg-a.avg);

  const top15Avg=Object.entries(byG).filter(([,r])=>r.length>=15)
    .map(([gid,r])=>{const top=[...r].sort((a,b)=>b-a).slice(0,15);return{golfer_id:parseInt(gid),avg:top.reduce((a,b)=>a+b,0)/top.length,rounds:r.length};})
    .sort((a,b)=>b.avg-a.avg);

  const tabs=[{id:"season",label:"Season Avg"},{id:"top15",label:"Top 15 Avg"},{id:"weekly",label:"Weekly"}];
  if(adminMode)tabs.push({id:"finance",label:"Payouts"});

  // Render ESPN-style leaderboard row
  const renderLbRow=(row:{golfer_id:number,avg?:number,rounds?:number,pts?:number,weekly_payout_won?:number,skins_payout_won?:number,entry_type?:string,summary_id?:number},rank:number,mode:"season"|"weekly")=>{
    const gid=row.golfer_id;
    const g=golfers.find((x:any)=>x.golfer_id===gid);
    const isExpanded=expandedId===gid;
    const stats=golferStats(golfers,leaderboard,gid,selSeason);
    const rankClass=rank===1?"r1":rank===2?"r2":rank===3?"r3":"";

    // Hole-by-hole scores for weekly detail
    const weeklyEntry=mode==="weekly"?leaderboard.find((r:any)=>r.event_id===displayEvent?.event_id&&r.golfer_id===gid):null;
    const hbhScores=weeklyEntry?.entry_type==="Hole-by-Hole"
      ?holeScores.filter((hs:any)=>hs.summary_id===weeklyEntry.summary_id).sort((a:any,b:any)=>a.hole_number-b.hole_number)
      :[];
    const signup=displayEvent?signups.find((s:any)=>s.event_id===displayEvent.event_id&&s.golfer_id===gid):null;
    const teePlayed=signup?.tee_box_course_id?courses.find((c:any)=>c.course_id===signup.tee_box_course_id):null;

    return(
      <div key={gid}>
        <div className={`lb-row${isExpanded?" expanded":""}`} onClick={()=>setExpandedId(isExpanded?null:gid)}>
          <div className={`lb-rank-cell ${rankClass}`}>{rank}</div>
          <div className="lb-name-cell">
            <div className="lb-name-main">{g?`${g.first_name} ${g.last_name}`:"Unknown"}</div>
            
          </div>
          <div className="lb-score-cell">
            <div className="lb-score-big">{mode==="season"?(row.avg as number).toFixed(1):mode==="weekly"?(row as any).total_stableford_points:""}</div>
            
          </div>
          <div className="lb-thru-cell">
            <div className="lb-thru-big">{mode==="weekly"?(hbhScores.length>0?hbhScores.length:"—"):row.rounds}</div>
            
          </div>
        </div>
        {isExpanded&&(
          <div className="lb-detail">
            {mode==="season"?(
              <div className="lb-detail-grid">
                <div className="lb-detail-item"><div className="lb-detail-key">HCP Index</div><div className="lb-detail-val">{g?.current_handicap_index?.toFixed(1)}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">Rounds</div><div className="lb-detail-val">{stats.rounds}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">1st Place Wins</div><div className="lb-detail-val">{stats.wins}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">2nd Place</div><div className="lb-detail-val">{stats.seconds}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">Best Round</div><div className="lb-detail-val" style={{color:"var(--gold-600)"}}>{stats.best}</div></div>
                <div className="lb-detail-item"><div className="lb-detail-key">Worst Round</div><div className="lb-detail-val" style={{color:"var(--red-600)"}}>{stats.worst}</div></div>
                <div className="lb-detail-item" style={{gridColumn:"1/-1"}}><div className="lb-detail-key">Total Earnings</div><div className="lb-detail-val" style={{color:"var(--green-700)"}}>${stats.totalEarnings.toFixed(0)}</div></div>
              </div>
            ):(
              <>
                <div className="lb-detail-grid" style={{marginBottom:hbhScores.length>0?10:0}}>
                  <div className="lb-detail-item"><div className="lb-detail-key">Playing HCP</div><div className="lb-detail-val">{signup?.playing_handicap??teePlayed?calcPlayingHandicap(g?.current_handicap_index,teePlayed.tee_slope,teePlayed.tee_rating,teePlayed.par):"—"}</div></div>
                  <div className="lb-detail-item"><div className="lb-detail-key">Tees Played</div><div className="lb-detail-val">{teePlayed?.tee_box_name??"—"}</div></div>
                  {weeklyEntry?.weekly_payout_won>0&&<div className="lb-detail-item"><div className="lb-detail-key">Stableford Win</div><div className="lb-detail-val" style={{color:"var(--gold-600)"}}>${weeklyEntry.weekly_payout_won}</div></div>}
                  {weeklyEntry?.skins_payout_won>0&&<div className="lb-detail-item"><div className="lb-detail-key">Skins Won</div><div className="lb-detail-val" style={{color:"var(--green-700)"}}>${weeklyEntry.skins_payout_won}</div></div>}
                </div>
                {hbhScores.length>0&&(()=>{
                  const c=teePlayed||courses.find((c:any)=>c.course_name===displayEvent?.course_name);
                  return(
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6}}>Hole by Hole</div>
                      <div className="hbh-grid">
                        {[...Array(9)].map((_,i)=><div key={i} className="hbh-cell header">{i+1}</div>)}
                        {hbhScores.slice(0,9).map((hs:any)=>{
                          const p=hs.stableford_points;
                          const cls=p>=4?"eagle":p===3?"birdie":p===2?"par":p===1?"bogey":"dbl";
                          return<div key={hs.hole_number} className={`hbh-cell ${cls}`}>{hs.gross_score}<span style={{fontSize:9,display:"block",lineHeight:1}}>{p}pt</span></div>;
                        })}
                      </div>
                      {hbhScores.length>9&&<div className="hbh-grid" style={{marginTop:3}}>
                        {[...Array(9)].map((_,i)=><div key={i} className="hbh-cell header">{i+10}</div>)}
                        {hbhScores.slice(9,18).map((hs:any)=>{
                          const p=hs.stableford_points;
                          const cls=p>=4?"eagle":p===3?"birdie":p===2?"par":p===1?"bogey":"dbl";
                          return<div key={hs.hole_number} className={`hbh-cell ${cls}`}>{hs.gross_score}<span style={{fontSize:9,display:"block",lineHeight:1}}>{p}pt</span></div>;
                        })}
                      </div>}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return(
    <div>
      <div className="section-title">Leaderboard</div>
      <div className="section-sub">Saturday School · All Seasons</div>

      {/* Year filter */}
      <div className="year-row">
        <button className={`year-pill${selSeason==="all"?" active":""}`} onClick={()=>setSelSeason("all")}>All Time</button>
        {allSeasons.map(y=><button key={y} className={`year-pill${selSeason===y?" active":""}`} onClick={()=>setSelSeason(y)}>{y}</button>)}
      </div>

      <div className="tab-sub">
        {tabs.map(t=><button key={t.id} className={`tab-sub-btn${subTab===t.id?" active":""}`} onClick={()=>{setSubTab(t.id);setExpandedId(null);}}>{t.label}</button>)}
      </div>

      {/* ── SEASON AVG ── */}
      {subTab==="season"&&(
        <>
          <div style={{fontSize:14,color:"var(--text-muted)",marginBottom:12}}>Season average · Min 15 rounds · Guests excluded</div>
          {seasonAvg.length===0&&<div className="empty-state"><div className="empty-text">No qualifying golfers yet</div><div className="empty-sub">Requires 15+ rounds</div></div>}
          {seasonAvg.length>0&&(
            <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
              <div className="lb-header">
                <div className="lb-header-cell">POS</div>
                <div className="lb-header-cell">Golfer</div>
                <div className="lb-header-cell right">Avg</div>
                <div className="lb-header-cell right">Rnds</div>
              </div>
              {seasonAvg.map((row,i)=>renderLbRow({golfer_id:row.golfer_id,avg:row.avg,rounds:row.rounds},i+1,"season"))}
            </div>
          )}
        </>
      )}

      {/* ── TOP 15 AVG ── */}
      {subTab==="top15"&&(
        <>
          <div style={{fontSize:14,color:"var(--text-muted)",marginBottom:12}}>Best 15 rounds average · Min 15 rounds · Guests excluded</div>
          {top15Avg.length>0&&(
            <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
              <div className="lb-header">
                <div className="lb-header-cell">#</div>
                <div className="lb-header-cell">Golfer</div>
                <div className="lb-header-cell right">Avg</div>
                <div className="lb-header-cell right">Rnds</div>
              </div>
              {top15Avg.map((row,i)=>renderLbRow({golfer_id:row.golfer_id,avg:row.avg,rounds:row.rounds},i+1,"season"))}
            </div>
          )}
        </>
      )}

      {/* ── WEEKLY ── */}
      {subTab==="weekly"&&(
        <>
          <div className="form-group">
            <label className="form-label">Event</label>
            <select className="form-select" value={displayEvent?.event_id||""} onChange={e=>setSelEventId(parseInt(e.target.value))}>
              {seasonEvents.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>)}
            </select>
          </div>
          {displayEvent&&(
            <>
              {!skinsEligible&&eventEntries.some((e:any)=>e.entry_type==="Total Only")&&(
                <div className="skins-warning">
                  <span>⚠</span>
                  <span>Mixed score entry — skins cannot be calculated as not all players submitted hole-by-hole scores.</span>
                </div>
              )}
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-value">{paidEntries.length}</div><div className="stat-label">Players</div></div>
                <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)"}}>${totalPot}</div><div className="stat-label">Stableford Pot</div></div>
              </div>
              {eventEntries.length>=2&&(
                <div className="podium-row">
                  {eventEntries.slice(0,2).map((e:any,i:number)=>{
                    const pct=i===0?(tied1st.length>1?1.0:0.75):0.25;
                    const payout=(totalPot*pct/(i===0?tied1st.length:1)).toFixed(0);
                    return(
                      <div key={e.summary_id} className={`podium-card p${i+1}`}>
                        <div className="podium-pos">{i===0?"🥇":"🥈"}</div>
                        <div className="podium-pname">{golferName(golfers,e.golfer_id).split(" ")[0]}</div>
                        <div className="podium-pscore">{e.total_stableford_points} pts</div>
                        <div className="podium-payout">${payout}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
                <div className="lb-header" style={{gridTemplateColumns:"36px 1fr 64px 56px"}}>
                  <div className="lb-header-cell">#</div>
                  <div className="lb-header-cell">Golfer</div>
                  <div className="lb-header-cell right">Pts</div>
                  <div className="lb-header-cell right">Holes</div>
                </div>
                {eventEntries.map((entry:any,i:number)=>renderLbRow({...entry,rounds:entry.total_stableford_points},i+1,"weekly"))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── PAYOUTS (admin only) ── */}
      {subTab==="finance"&&adminMode&&<FinanceView golfers={golfers} leaderboard={leaderboard} events={seasonEvents} charityDonations={charityDonations} setCharityDonations={setCharityDonations} showSuccess={showSuccess}/>}
    </div>
  );
}



function FinanceView({golfers,leaderboard,events,charityDonations,setCharityDonations,showSuccess}:any){
  const [selEventId,setSelEventId]=useState(events[0]?.event_id||null);
  const [newDonationAmt,setNewDonationAmt]=useState("");
  const [newDonationNote,setNewDonationNote]=useState("");

  const entries=leaderboard.filter((e:any)=>e.event_id===selEventId);
  const paidIn=entries.filter((e:any)=>e.buy_in_paid).length;
  const skinsPaid=entries.filter((e:any)=>e.skins_paid).length;
  const charityFromRounds=leaderboard.filter((e:any)=>e.charity_paid).length*5;
  const extraDonations=charityDonations.reduce((s:number,d:any)=>s+d.amount,0);
  const lifetimeCharity=charityFromRounds+extraDonations;

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
        <div className="charity-label" style={{marginTop:5}}>Rounds: ${charityFromRounds} · Donations: ${extraDonations}</div>
      </div>

      {/* Extra donations */}
      <div className="card-title" style={{marginBottom:8}}>Charity Donations</div>
      {charityDonations.map((d:any)=>(
        <div key={d.id} className="info-row">
          <span className="info-key">{d.note}</span>
          <span style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>{d.date}</span>
            <span className="money">${d.amount}</span>
          </span>
        </div>
      ))}
      <div className="card" style={{marginTop:10}}>
        <div className="card-title" style={{marginBottom:10}}>Add Donation</div>
        <div className="form-group">
          <label className="form-label">Amount ($)</label>
          <input className="form-input" type="number" min="0" placeholder="50" value={newDonationAmt} onChange={e=>setNewDonationAmt(e.target.value)}/>
        </div>
        <div className="form-group">
          <label className="form-label">Note</label>
          <input className="form-input" placeholder="e.g. Birthday donation" value={newDonationNote} onChange={e=>setNewDonationNote(e.target.value)}/>
        </div>
        <button className="btn btn-primary btn-full" onClick={addDonation} disabled={!newDonationAmt}>Record Donation</button>
      </div>

      <hr className="divider"/>
      <div className="form-group">
        <label className="form-label">Event Breakdown</label>
        <select className="form-select" value={selEventId||""} onChange={e=>setSelEventId(parseInt(e.target.value))}>
          {events.map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>)}
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
              <td style={{textAlign:"right"}} className="money">${e.weekly_payout_won.toFixed(0)}</td>
              <td style={{textAlign:"right"}} className="money">${e.skins_payout_won.toFixed(0)}</td>
              <td style={{textAlign:"right"}} className="money">${(e.weekly_payout_won+e.skins_payout_won).toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// SIGN-UP TAB  (#3a show all tee times, #3b two sub-tabs)
// ============================================================
function RSVPTab({golfers,events,signups,setSignups,showSuccess,adminMode}:any){
  const upcomingEvents=[...events].filter((e:any)=>e.status!=="Completed").sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  const [selEventId,setSelEventId]=useState<number>(upcomingEvents[0]?.event_id||0);
  const [subTab,setSubTab]=useState("rsvp");
  const [guestName,setGuestName]=useState("");
  const [guestSponsor,setGuestSponsor]=useState("");
  const [guestHcp,setGuestHcp]=useState("18");

  const selEvent=events.find((e:any)=>e.event_id===selEventId);
  const eventSignups=signups.filter((s:any)=>s.event_id===selEventId);
  const yesCount=eventSignups.filter((s:any)=>s.attending==="Yes").length;
  const noCount=eventSignups.filter((s:any)=>s.attending==="No").length;
  const unconfCount=eventSignups.filter((s:any)=>s.attending==="Unconfirmed").length;

  const updateAttending=(signup_id:number,val:string,gid:number)=>{
    setSignups((p:any)=>p.map((s:any)=>s.signup_id===signup_id?{...s,attending:val}:s));
    showSuccess(`RSVP updated for ${golferName(golfers,gid)}`);
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

      {/* Event summary card – #3a show ALL tee times */}
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
                    <button className={`rsvp-btn yes${signup.attending==="Yes"?" active":""}`} onClick={()=>updateAttending(signup.signup_id,"Yes",g.golfer_id)}>In</button>
                    <button className={`rsvp-btn no${signup.attending==="No"?" active":""}`} onClick={()=>updateAttending(signup.signup_id,"No",g.golfer_id)}>Out</button>
                  </div>
                </div>
                {myGuests.map((gs:any)=>{
                  const gg=golfers.find((x:any)=>x.golfer_id===gs.golfer_id);
                  return(
                    <div key={gs.signup_id} className="rsvp-row" style={{paddingLeft:20,background:"var(--gold-50)"}}>
                      <div className="rsvp-name" style={{fontSize:15,color:"var(--gold-800)"}}>↳ {gg?`${gg.first_name} ${gg.last_name}`:"Guest"} <span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px"}}>guest</span></div>
                      <div className="rsvp-actions">
                        <button className={`rsvp-btn yes${gs.attending==="Yes"?" active":""}`} onClick={()=>updateAttending(gs.signup_id,"Yes",gs.golfer_id)}>In</button>
                        <button className={`rsvp-btn no${gs.attending==="No"?" active":""}`} onClick={()=>updateAttending(gs.signup_id,"No",gs.golfer_id)}>Out</button>
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
                    const tee=su.tee_box_course_id?courses?.find((c:any)=>c.course_id===su.tee_box_course_id):null;
                    return(
                      <div key={su.signup_id} className="pairing-player">
                        <div>
                          <span style={{fontWeight:500}}>{g?`${g.first_name} ${g.last_name}`:"Guest"}</span>
                          {su.is_guest_entry&&<span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px",marginLeft:6,color:"var(--gold-800)"}}>guest</span>}
                        </div>
                        <span className="pairing-hcp">{tee?`${tee.tee_box_name} tee`:"—"}</span>
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

function ScoreEntryTab({golfers,courses,events,signups,leaderboard,setLeaderboard,holeScores,setHoleScores,setEvents,showSuccess}:any){
  const [mode,setMode]=useState("total");
  const [selEventId,setSelEventId]=useState("");
  const [scorers,setScorers]=useState([emptyScorer()]);

  const activeEvents=events.filter((e:any)=>e.status==="Pairings Set"||e.status==="In-Progress");
  const selEvent=events.find((e:any)=>e.event_id===parseInt(selEventId));
  const availableTees=selEvent?courses.filter((c:any)=>c.course_name===selEvent.course_name):[];

  // Check skins eligibility warning for this event
  const eventEntries=leaderboard.filter((r:any)=>r.event_id===selEvent?.event_id);
  const hasMixedEntry=eventEntries.length>0&&eventEntries.some((r:any)=>r.entry_type==="Total Only");

  const addScorer=()=>{if(scorers.length<4)setScorers(p=>[...p,emptyScorer()]);};
  const removeScorer=(idx:number)=>setScorers(p=>p.filter((_,i)=>i!==idx));

  const updateScorer=(idx:number,field:string,val:any)=>{
    setScorers(p=>p.map((s,i)=>i===idx?{...s,[field]:val}:s));
  };
  const updateGross=(idx:number,hole:number,val:string)=>{
    setScorers(p=>p.map((s,i)=>{
      if(i!==idx)return s;
      const gs=[...s.grossScores]; gs[hole]=val; return{...s,grossScores:gs};
    }));
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

  const ptsClass=(pts:number|null)=>{if(pts===null||pts===undefined)return"";if(pts>=4)return"pts-eagle";if(pts===3)return"pts-birdie";if(pts===2)return"pts-par";if(pts===1)return"pts-bogey";return"pts-zero";};

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
      {selEvent&&hasMixedEntry&&mode==="total"&&(
        <div className="skins-warning"><span>⚠</span><span>This event already has hole-by-hole entries. Submitting total-only scores will prevent skins from being calculated.</span></div>
      )}

      {/* Scorer cards – up to 4 */}
      {selEvent&&scorers.map((scorer,idx)=>{
        const g=golfers.find((x:any)=>x.golfer_id===parseInt(scorer.golferId));
        const course=courses.find((c:any)=>c.course_id===parseInt(scorer.courseId));
        const phcp=g&&course?calcPlayingHandicap(g.current_handicap_index,course.tee_slope,course.tee_rating,course.par):null;
        const holeCalcs=course&&mode==="hole"?calcHoleScores(scorer.grossScores,phcp||0,course):[];
        const calcTotal=holeCalcs.reduce((s:number,h:any)=>s+(h.points??0),0);
        const alreadyIn=selEvent&&scorer.golferId?leaderboard.some((r:any)=>r.event_id===selEvent.event_id&&r.golfer_id===parseInt(scorer.golferId)):false;

        return(
          <div key={idx} className={`scorer-card${scorer.golferId?" active-scorer":""}`}>
            <div className="scorer-header">
              <span className="scorer-num">Golfer {idx+1}</span>
              {idx>0&&<button className="btn btn-sm btn-danger" onClick={()=>removeScorer(idx)}>Remove</button>}
            </div>
            <div className="form-group">
              <label className="form-label">Golfer</label>
              <select className="form-select" value={scorer.golferId} onChange={e=>updateScorer(idx,"golferId",e.target.value)}>
                <option value="">Select golfer…</option>
                {golfers.filter((g:any)=>g.status==="Active").map((g:any)=><option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}{g.is_guest?" (Guest)":""}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tee Box</label>
              <select className="form-select" value={scorer.courseId} onChange={e=>updateScorer(idx,"courseId",e.target.value)}>
                <option value="">Select tee…</option>
                {availableTees.map((t:any)=><option key={t.course_id} value={t.course_id}>{t.tee_box_name} — Slope {t.tee_slope} / Rating {t.tee_rating}</option>)}
              </select>
            </div>
            {g&&course&&(
              <div style={{display:"flex",gap:10,marginBottom:12,padding:"8px 10px",background:"var(--green-50)",borderRadius:"var(--radius-md)"}}>
                <div style={{flex:1}}><div style={{fontSize:12,color:"var(--text-muted)",textTransform:"uppercase",fontWeight:600,letterSpacing:"0.06em"}}>Playing HCP</div><div style={{fontSize:22,fontWeight:700,color:"var(--green-700)"}}>{phcp}</div></div>
                {alreadyIn&&<div style={{fontSize:12,color:"var(--gold-700)",alignSelf:"center"}}>⚠ Will overwrite existing</div>}
              </div>
            )}
            {mode==="total"&&(
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Stableford Points</label>
                <input className="form-input" type="number" min="0" max="72" placeholder="e.g. 36" value={scorer.totalPts} onChange={e=>updateScorer(idx,"totalPts",e.target.value)}/>
              </div>
            )}
            {mode==="hole"&&course&&(
              <div className="score-grid">
                <table className="score-table">
                  <thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>Gross</th><th>Net</th><th>Pts</th></tr></thead>
                  <tbody>
                    {Array.from({length:18},(_,i)=>{
                      const h=holeCalcs[i]||{};
                      return(
                        <tr key={i}>
                          <td style={{fontWeight:600}}>{i+1}</td>
                          <td>{course.hole_pars[i]}</td>
                          <td style={{color:"var(--text-muted)"}}>{course.hole_stroke_indices[i]}</td>
                          <td className="score-input-cell"><input type="number" min="1" max="15" value={scorer.grossScores[i]} onChange={e=>updateGross(idx,i,e.target.value)}/></td>
                          <td>{h.net??""}</td>
                          <td className={ptsClass(h.points)} style={{fontWeight:h.points!=null?700:400}}>{h.points!==null&&h.points!==undefined?h.points:""}</td>
                        </tr>
                      );
                    })}
                    <tr style={{background:"var(--green-50)"}}>
                      <td colSpan={3} style={{fontWeight:700,textAlign:"left",paddingLeft:8,fontSize:13,textTransform:"uppercase",letterSpacing:"0.06em"}}>Total</td>
                      <td>{scorer.grossScores.reduce((s:number,v:string)=>s+(v?parseInt(v):0),0)||""}</td>
                      <td></td>
                      <td style={{fontSize:18,fontWeight:700,color:"var(--green-700)"}}>{calcTotal||""}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

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
function AdminTab({golfers,setGolfers,courses,events,setEvents,signups,setSignups,leaderboard,showSuccess}:any){
  const [subTab,setSubTab]=useState("hcp");
  return(
    <div>
      <div className="section-title">Admin</div>
      <div className="section-sub">League management tools</div>
      <div className="tab-sub">
        {[{id:"hcp",label:"Handicaps"},{id:"coursehcp",label:"Course HCPs"},{id:"events",label:"Events"},{id:"pairings",label:"Pairings"}].map(t=>(
          <button key={t.id} className={`tab-sub-btn${subTab===t.id?" active":""}`} onClick={()=>setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {subTab==="hcp"&&<HandicapManager golfers={golfers} setGolfers={setGolfers} showSuccess={showSuccess}/>}
      {subTab==="coursehcp"&&<CourseHcpSheet golfers={golfers} courses={courses} showSuccess={showSuccess}/>}
      {subTab==="events"&&<EventCreator courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} golfers={golfers} showSuccess={showSuccess}/>}
      {subTab==="pairings"&&<PairingDashboard golfers={golfers} courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} showSuccess={showSuccess}/>}
    </div>
  );
}

function HandicapManager({golfers,setGolfers,showSuccess}:any){
  const [edits,setEdits]=useState<Record<number,string>>({});
  const handleSave=()=>{setGolfers((p:any)=>p.map((g:any)=>edits[g.golfer_id]!==undefined?{...g,current_handicap_index:parseFloat(edits[g.golfer_id])||g.current_handicap_index}:g));setEdits({});showSuccess("Handicap indices updated");};
  return(
    <div>
      <div className="card-title" style={{marginBottom:12}}>Weekly Handicap Update</div>
      {golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=>(
        <div key={g.golfer_id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <div style={{flex:1,fontSize:16,fontWeight:500}}>{g.first_name} {g.last_name}</div>
          <input type="number" step="0.1" min="0" max="54" style={{width:76,padding:"8px 8px",border:"1.5px solid var(--border-md)",borderRadius:"var(--radius-md)",fontFamily:"DM Sans,sans-serif",fontSize:16,textAlign:"center"}} value={edits[g.golfer_id]!==undefined?edits[g.golfer_id]:g.current_handicap_index} onChange={e=>setEdits(p=>({...p,[g.golfer_id]:e.target.value}))}/>
        </div>
      ))}
      <button className="btn btn-primary btn-full" style={{marginTop:14}} onClick={handleSave}>Save All Handicaps</button>
    </div>
  );
}

function CourseHcpSheet({golfers,courses,showSuccess}:any){
  const courseNames=uniqueCourseNames(courses);
  const [selCourseName,setSelCourseName]=useState(courseNames[0]||"");
  const tees=teeBoxesForCourse(courses,selCourseName);
  const members=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active");
  const buildEmailBody=()=>{
    let body=`Saturday School – Course Handicaps\n${selCourseName}\n\n`;
    body+=`${"Golfer".padEnd(22)}${tees.map((t:any)=>t.tee_box_name.padEnd(10)).join("")}\n${"-".repeat(22+tees.length*10)}\n`;
    members.forEach((g:any)=>{body+=`${(g.first_name+" "+g.last_name).padEnd(22)}${tees.map((t:any)=>String(calcPlayingHandicap(g.current_handicap_index,t.tee_slope,t.tee_rating,t.par)).padEnd(10)).join("")}\n`;});
    return body;
  };
  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);
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
          <a href={`mailto:?bcc=${allEmails.join(",")}&subject=Saturday School – Course Handicaps: ${selCourseName}&body=${encodeURIComponent(buildEmailBody())}`} className="btn btn-outline btn-full" style={{marginTop:14,textDecoration:"none",display:"flex"}}>✉ Email Course Handicaps</a>
        </>
      )}
    </div>
  );
}

function EventCreator({courses,events,setEvents,signups,setSignups,golfers,showSuccess}:any){
  const [date,setDate]=useState("");
  const [courseName,setCourseName]=useState("");
  const [teeTimes,setTeeTimes]=useState("08:00\n08:10\n08:20\n08:30");
  const [season,setSeason]=useState(new Date().getFullYear());
  const courseNames=uniqueCourseNames(courses);
  const handleCreate=()=>{
    if(!date||!courseName)return;
    const newId=Math.max(...events.map((e:any)=>e.event_id),0)+1;
    const tts=teeTimes.split("\n").map(t=>t.trim()).filter(Boolean);
    setEvents((p:any)=>[...p,{event_id:newId,season,date,course_name:courseName,tee_times:tts,status:"Upcoming"}]);
    const activeGs=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active");
    setSignups((p:any)=>[...p,...activeGs.map((g:any,i:number)=>({signup_id:Date.now()+i,event_id:newId,golfer_id:g.golfer_id,attending:"Unconfirmed",assigned_tee_time:null,tee_box_course_id:null,playing_handicap:null,is_guest_entry:false,sponsor_golfer_id:null}))]);
    showSuccess(`Event created: ${formatDate(date)}`);
    setDate(""); setCourseName(""); setTeeTimes("08:00\n08:10\n08:20\n08:30");
  };
  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);
  return(
    <div>
      <div className="card-title" style={{marginBottom:12}}>Create New Event</div>
      <div className="form-group"><label className="form-label">Season (Year)</label><input className="form-input" type="number" min="2020" max="2040" value={season} onChange={e=>setSeason(parseInt(e.target.value))}/></div>
      <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      <div className="form-group"><label className="form-label">Golf Course</label><select className="form-select" value={courseName} onChange={e=>setCourseName(e.target.value)}><option value="">Select course…</option>{courseNames.map(n=><option key={n} value={n}>{n}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Tee Times (one per line)</label><textarea className="form-input" rows={5} value={teeTimes} onChange={e=>setTeeTimes(e.target.value)} style={{resize:"vertical"}}/></div>
      <button className="btn btn-primary btn-full" onClick={handleCreate}>Create Event</button>
      <hr className="divider"/>
      <div className="card-title" style={{marginBottom:8}}>Invitation Email</div>
      <a href={`mailto:?bcc=${allEmails.join(",")}&subject=Saturday School – Upcoming Round&body=Hi all, join us for our next Saturday round. Please RSVP on the app!`} className="btn btn-outline btn-full" style={{textDecoration:"none",display:"flex"}}>✉ Send Invitation</a>
    </div>
  );
}

function PairingDashboard({golfers,courses,events,setEvents,signups,setSignups,showSuccess}:any){
  const [selEventId,setSelEventId]=useState(events.find((e:any)=>e.status!=="Completed")?.event_id||"");
  const [pairings,setPairings]=useState<any[]|null>(null);
  const [confirmed,setConfirmed]=useState(false);
  const selEvent=events.find((e:any)=>e.event_id===parseInt(selEventId));
  const eventSignups=selEvent?signups.filter((s:any)=>s.event_id===selEvent.event_id&&s.attending==="Yes"):[];
  const runPairings=()=>{const a=eventSignups.map((s:any)=>({golfer_id:s.golfer_id,sponsor_golfer_id:s.sponsor_golfer_id}));setPairings(runPairingEngine(a,selEvent.tee_times));setConfirmed(false);};
  const confirmPairings=()=>{
    if(!pairings||!selEvent)return;
    const teeMap:Record<number,string>={};
    pairings.forEach(g=>g.players.forEach((gid:number)=>{teeMap[gid]=g.teeTime;}));
    setSignups((p:any)=>p.map((s:any)=>{
      if(s.event_id!==selEvent.event_id||!teeMap[s.golfer_id])return s;
      const g=golfers.find((x:any)=>x.golfer_id===s.golfer_id);
      const cid=s.tee_box_course_id||courses.filter((c:any)=>c.course_name===selEvent.course_name)[0]?.course_id;
      const tee=courses.find((c:any)=>c.course_id===cid);
      const ph=g&&tee?calcPlayingHandicap(g.current_handicap_index,tee.tee_slope,tee.tee_rating,tee.par):null;
      return{...s,assigned_tee_time:teeMap[s.golfer_id],playing_handicap:ph};
    }));
    setEvents((p:any)=>p.map((e:any)=>e.event_id===selEvent.event_id?{...e,status:"Pairings Set"}:e));
    setConfirmed(true); showSuccess("Pairings confirmed");
  };
  const buildBody=()=>{
    if(!pairings||!selEvent)return"";
    let b=`Saturday School – Pairings\n${formatDate(selEvent.date)} @ ${selEvent.course_name}\n\n`;
    pairings.forEach((g:any,i:number)=>{
      b+=`Group ${i+1} – Tee: ${g.teeTime}\n`;
      g.players.forEach((gid:number)=>{
        const gl=golfers.find((x:any)=>x.golfer_id===gid);
        const su=signups.find((s:any)=>s.event_id===selEvent.event_id&&s.golfer_id===gid);
        const tee=courses.find((c:any)=>c.course_id===su?.tee_box_course_id);
        const ph=gl&&tee?calcPlayingHandicap(gl.current_handicap_index,tee.tee_slope,tee.tee_rating,tee.par):"—";
        b+=`  • ${gl?.first_name} ${gl?.last_name}${gl?.is_guest?" (Guest)":""} — HCP ${ph}\n`;
      });b+="\n";
    });
    return b;
  };
  const allEmails=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);
  return(
    <div>
      <div className="card-title" style={{marginBottom:12}}>Pairing Engine</div>
      <div className="form-group"><label className="form-label">Event</label><select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value);setPairings(null);setConfirmed(false);}}><option value="">Select event…</option>{events.filter((e:any)=>e.status!=="Completed").map((ev:any)=><option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>)}</select></div>
      {selEvent&&<div className="card" style={{padding:"10px 14px",marginBottom:12}}><div className="info-row"><span className="info-key">Confirmed players</span><span className="info-val" style={{color:"var(--green-700)",fontWeight:700}}>{eventSignups.length}</span></div><div className="info-row"><span className="info-key">Tee times</span><span className="info-val">{selEvent.tee_times.join(" · ")}</span></div><div className="info-row"><span className="info-key">Groups</span><span className="info-val">{eventSignups.length>0?Math.ceil(eventSignups.length/4):"—"}</span></div></div>}
      <button className="btn btn-gold btn-full" onClick={runPairings} disabled={!selEvent||eventSignups.length<2}>🎲 Generate Pairings</button>
      {pairings&&(
        <div style={{marginTop:14}}>
          {pairings.map((group:any,i:number)=>(
            <div key={i} className="pairing-card">
              <div className="pairing-header"><span className="pairing-time">⏱ {group.teeTime}</span><span className="pairing-group">Group {i+1} · {group.players.length}</span></div>
              <div className="pairing-body">
                {group.players.map((gid:number)=>{
                  const g=golfers.find((x:any)=>x.golfer_id===gid);
                  const su=signups.find((s:any)=>s.event_id===selEvent?.event_id&&s.golfer_id===gid);
                  const tee=courses.find((c:any)=>c.course_id===su?.tee_box_course_id);
                  const ph=g&&tee?calcPlayingHandicap(g.current_handicap_index,tee.tee_slope,tee.tee_rating,tee.par):"—";
                  return(<div key={gid} className="pairing-player"><div>{g?.first_name} {g?.last_name}{g?.is_guest&&<span style={{fontSize:11,fontWeight:600,background:"var(--gold-100)",borderRadius:4,padding:"1px 5px",marginLeft:5,color:"var(--gold-800)"}}>guest</span>}{su?.sponsor_golfer_id&&<span style={{fontSize:11,color:"var(--text-muted)",marginLeft:4}}>w/{golferName(golfers,su.sponsor_golfer_id).split(" ")[0]}</span>}</div><span className="pairing-hcp">HCP {ph}{tee?` (${tee.tee_box_name})`:""}</span></div>);
                })}
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={confirmPairings} disabled={confirmed}>{confirmed?"✓ Confirmed":"Confirm"}</button>
            <a href={`mailto:?bcc=${allEmails.join(",")}&subject=Saturday School Pairings – ${formatDate(selEvent?.date)}&body=${encodeURIComponent(buildBody())}`} className="btn btn-outline" style={{flex:1,textDecoration:"none"}}>✉ Email</a>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANALYTICS TAB
// ============================================================
function AnalyticsTab({golfers,courses,events,leaderboard}:any){
  const [subTab,setSubTab]=useState("course");
  const [selGolfer,setSelGolfer]=useState("");
  const [selSeason,setSelSeason]=useState<number|"all">(2026);

  const allSeasons=[...new Set(events.map((e:any)=>e.season))].sort((a:any,b:any)=>b-a);
  const courseNames=uniqueCourseNames(courses);
  const courseAvgs=courseNames.map(name=>{
    const evIds=events.filter((e:any)=>e.course_name===name&&(selSeason==="all"||e.season===selSeason)).map((e:any)=>e.event_id);
    const entries=leaderboard.filter((r:any)=>evIds.includes(r.event_id)&&!golfers.find((g:any)=>g.golfer_id===r.golfer_id)?.is_guest);
    const avg=entries.length?entries.reduce((s:number,r:any)=>s+r.total_stableford_points,0)/entries.length:0;
    return{name,avg,count:entries.length};
  });
  const scatterData=golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=>{
    const rounds=[...leaderboard.filter((r:any)=>r.golfer_id===g.golfer_id&&(selSeason==="all"||r.season===selSeason)).map((r:any)=>r.total_stableford_points),...(EXTRA_ROUNDS_BY_GOLFER[g.golfer_id]||[]).filter(r=>selSeason==="all"||r.season===selSeason).map(r=>r.pts)];
    if(!rounds.length)return null;
    return{golfer:g,hcp:g.current_handicap_index,avg:rounds.reduce((a:number,b:number)=>a+b,0)/rounds.length,rounds:rounds.length};
  }).filter(Boolean);
  const selG=golfers.find((g:any)=>g.golfer_id===parseInt(selGolfer));
  const golferRounds=selG?[...leaderboard.filter((r:any)=>r.golfer_id===selG.golfer_id&&(selSeason==="all"||r.season===selSeason)).map((r:any)=>({pts:r.total_stableford_points,eid:r.event_id})),...(EXTRA_ROUNDS_BY_GOLFER[selG.golfer_id]||[]).filter(r=>selSeason==="all"||r.season===selSeason).map((r:any,i:number)=>({pts:r.pts,eid:-(i+1)}))].sort((a:any,b:any)=>a.eid-b.eid):[];

  return(
    <div>
      <div className="section-title">Analytics</div>
      <div className="section-sub">Performance breakdown</div>
      <div className="year-row">
        <button className={`year-pill${selSeason==="all"?" active":""}`} onClick={()=>setSelSeason("all")}>All Time</button>
        {allSeasons.map((y:any)=><button key={y} className={`year-pill${selSeason===y?" active":""}`} onClick={()=>setSelSeason(y)}>{y}</button>)}
      </div>
      <div className="tab-sub">
        {[{id:"course",label:"By Course"},{id:"scatter",label:"HCP vs Pts"},{id:"golfer",label:"Golfer History"}].map(t=>(
          <button key={t.id} className={`tab-sub-btn${subTab===t.id?" active":""}`} onClick={()=>setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {subTab==="course"&&<CourseChart courseAvgs={courseAvgs}/>}
      {subTab==="scatter"&&<ScatterChart scatterData={scatterData}/>}
      {subTab==="golfer"&&(
        <>
          <div className="form-group"><label className="form-label">Select Golfer</label><select className="form-select" value={selGolfer} onChange={e=>setSelGolfer(e.target.value)}><option value="">Choose golfer…</option>{golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=><option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>)}</select></div>
          {selG&&golferRounds.length>0&&<GolferHistoryChart golfer={selG} rounds={golferRounds}/>}
        </>
      )}
    </div>
  );
}

function useChart(canvasId:string,buildFn:(Chart:any)=>any,deps:any[]){
  useEffect(()=>{
    const tryBuild=()=>{
      const C=(window as any).Chart; if(!C)return false;
      const ctx=document.getElementById(canvasId) as HTMLCanvasElement; if(!ctx)return false;
      const existing=C.getChart(canvasId); if(existing)existing.destroy();
      buildFn(C); return true;
    };
    if(!tryBuild()){const id=setInterval(()=>{if(tryBuild())clearInterval(id);},300);return()=>clearInterval(id);}
  },deps);
}

function CourseChart({courseAvgs}:any){
  useChart("courseChart",(C)=>new C(document.getElementById("courseChart"),{type:"bar",data:{labels:courseAvgs.map((c:any)=>c.name),datasets:[{label:"Avg Pts",data:courseAvgs.map((c:any)=>parseFloat(c.avg.toFixed(1))),backgroundColor:["#1a7340","#c47800","#a32020","#0f4526"],borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:(c:any)=>` ${c.parsed.y.toFixed(1)} pts avg`}}},scales:{y:{beginAtZero:false,min:20,ticks:{color:"#6b5240",font:{family:"DM Sans, sans-serif",size:14}},grid:{color:"rgba(74,55,40,0.1)"}},x:{ticks:{color:"#6b5240",font:{family:"DM Sans, sans-serif",size:13}},grid:{display:false}}}}}),courseAvgs);
  return(
    <div>
      <div className="card-title" style={{marginBottom:12}}>Stableford Averages by Course</div>
      {courseAvgs.map((c:any)=><div key={c.name} className="info-row"><span className="info-key">{c.name}</span><span className="info-val">{c.count>0?`${c.avg.toFixed(1)} pts (${c.count} rounds)`:"No data"}</span></div>)}
      <div style={{position:"relative",width:"100%",height:210,marginTop:16}}><canvas id="courseChart" role="img" aria-label="Bar chart of average stableford points by course">Avg stableford by course</canvas></div>
    </div>
  );
}
function ScatterChart({scatterData}:any){
  useChart("scatterChart",(C)=>new C(document.getElementById("scatterChart"),{type:"scatter",data:{datasets:[{label:"Golfers",data:scatterData.map((d:any)=>({x:d.hcp,y:parseFloat(d.avg.toFixed(1)),name:`${d.golfer.first_name} ${d.golfer.last_name}`})),backgroundColor:"#1a7340",pointRadius:8,pointHoverRadius:11}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:(c:any)=>`${c.raw.name}: HCP ${c.raw.x} → ${c.raw.y.toFixed(1)} pts avg`}}},scales:{x:{title:{display:true,text:"Handicap Index",color:"#6b5240",font:{family:"DM Sans, sans-serif",size:14}},ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}},y:{title:{display:true,text:"Avg Stableford Pts",color:"#6b5240",font:{family:"DM Sans, sans-serif",size:14}},ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}}}}}),scatterData);
  return(
    <div>
      <div className="card-title" style={{marginBottom:5}}>Handicap Index vs Avg Performance</div>
      <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:12}}>Higher scores for a given HCP = outperforming. Tap a dot for name.</p>
      <div style={{position:"relative",width:"100%",height:270}}><canvas id="scatterChart" role="img" aria-label="Scatter plot handicap vs avg points">Handicap vs stableford</canvas></div>
    </div>
  );
}
function GolferHistoryChart({golfer,rounds}:any){
  const avg=rounds.reduce((s:number,r:any)=>s+r.pts,0)/rounds.length;
  useChart("histChart",(C)=>new C(document.getElementById("histChart"),{type:"line",data:{labels:rounds.map((_:any,i:number)=>`R${i+1}`),datasets:[{label:"Points",data:rounds.map((r:any)=>r.pts),borderColor:"#1a7340",backgroundColor:"rgba(26,115,64,0.08)",pointBackgroundColor:"#1a7340",pointRadius:4,fill:true,tension:0.3},{label:"Avg",data:Array(rounds.length).fill(parseFloat(avg.toFixed(1))),borderColor:"#c47800",borderDash:[5,4],pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#6b5240",font:{size:12},maxTicksLimit:12},grid:{display:false}},y:{min:15,ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}}}}}),[golfer,rounds]);
  const best=Math.max(...rounds.map((r:any)=>r.pts));
  const worst=Math.min(...rounds.map((r:any)=>r.pts));
  return(
    <div>
      <div className="stat-grid" style={{marginBottom:14}}>
        <div className="stat-card"><div className="stat-value">{avg.toFixed(1)}</div><div className="stat-label">Season Avg</div></div>
        <div className="stat-card"><div className="stat-value">{rounds.length}</div><div className="stat-label">Rounds</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)"}}>{best}</div><div className="stat-label">Best</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--red-600)"}}>{worst}</div><div className="stat-label">Worst</div></div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:9}}>
        <div style={{fontSize:16,fontWeight:700,color:"var(--green-700)"}}>{golfer.first_name} {golfer.last_name}</div>
        <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--text-muted)"}}>
          <span style={{width:14,height:3,background:"#1a7340",display:"inline-block",borderRadius:2}}></span>Rounds
          <span style={{width:14,height:3,background:"#c47800",display:"inline-block",borderRadius:2,marginLeft:4}}></span>Avg
        </span>
      </div>
      <div style={{position:"relative",width:"100%",height:210}}><canvas id="histChart" role="img" aria-label={`Line chart for ${golfer.first_name} ${golfer.last_name}`}>Round history</canvas></div>
    </div>
  );
}