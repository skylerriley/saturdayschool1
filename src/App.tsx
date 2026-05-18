import { useState, useEffect, useCallback } from "react";

// ============================================================
// CSS
// ============================================================
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Barlow+Condensed:wght@400;500;600;700&family=Barlow:wght@300;400;500;600&display=swap');

  :root {
    --green-900: #0a2e1a; --green-800: #0f4526; --green-700: #155c32;
    --green-600: #1a7340; --green-500: #228b50; --green-400: #2db368;
    --green-300: #5cc98a; --green-100: #d4f2e3; --green-50: #edf9f2;
    --gold-900: #3d2400;  --gold-800: #6b3d00;  --gold-700: #9a5a00;
    --gold-600: #c47800;  --gold-500: #e09400;  --gold-400: #f5b000;
    --gold-300: #ffc947;  --gold-100: #fff2cc;  --gold-50:  #fffaf0;
    --red-800: #7a1515;   --red-600: #c02020;   --red-400: #e84040;   --red-100: #fde8e8;
    --earth-900: #1c1410; --earth-800: #2e221a; --earth-700: #4a3728;
    --earth-600: #6b5240; --earth-400: #9c7c65; --earth-200: #d4c4b8;
    --earth-100: #ede6e0; --earth-50:  #f7f4f1;
    --bg: #f4f1ec; --surface: #ffffff; --surface2: #f9f7f4;
    --border: rgba(74,55,40,0.15); --border-md: rgba(74,55,40,0.25);
    --text-primary: #1c1410; --text-secondary: #6b5240; --text-muted: #9c7c65;
    --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px; --radius-xl: 24px;
    --shadow-sm: 0 1px 3px rgba(28,20,16,0.08);
    --shadow-md: 0 4px 16px rgba(28,20,16,0.10);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body, #root {
    width: 100%;
    overflow-x: hidden;
  }

  body {
    font-family: 'Barlow', sans-serif;
    background: var(--bg);
    color: var(--text-primary);
    font-size: 16px;
    line-height: 1.5;
    min-height: 100vh;
  }

  /* FIX #1 – fixed-width shell, no content-driven width changes */
  .app-shell {
    width: 100%;
    max-width: 480px;
    min-width: 320px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    overflow-x: hidden;
  }

  .app-header {
    background: var(--green-900);
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3);
    width: 100%;
  }
  .header-top { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 8px; }
  .brand { display: flex; flex-direction: column; }
  .brand-name { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: var(--gold-400); letter-spacing: 0.02em; line-height: 1.1; }
  .brand-tagline { font-family: 'Barlow Condensed', sans-serif; font-size: 11px; color: var(--green-300); letter-spacing: 0.12em; text-transform: uppercase; }
  .header-badge { background: var(--gold-500); color: var(--green-900); font-family: 'Barlow Condensed', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; padding: 4px 10px; border-radius: 20px; cursor: pointer; border: none; }

  .nav-tabs { display: flex; overflow-x: auto; scrollbar-width: none; border-top: 1px solid rgba(255,255,255,0.08); }
  .nav-tabs::-webkit-scrollbar { display: none; }
  .nav-tab { flex-shrink: 0; padding: 10px 14px; font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: color 0.2s, border-color 0.2s; white-space: nowrap; }
  .nav-tab.active { color: var(--gold-300); border-bottom-color: var(--gold-400); }
  .nav-tab:hover:not(.active) { color: rgba(255,255,255,0.75); }

  /* Main – force content to stay inside shell width */
  .main-content { flex: 1; padding: 16px; width: 100%; min-width: 0; overflow-x: hidden; }

  .section-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 600; color: var(--green-800); margin-bottom: 4px; }
  .section-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; font-weight: 400; }

  .card { background: var(--surface); border-radius: var(--radius-lg); border: 1px solid var(--border); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-sm); }
  .card-title { font-family: 'Barlow Condensed', sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--green-700); }

  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 18px; border-radius: var(--radius-md); font-family: 'Barlow Condensed', sans-serif; font-size: 14px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; border: none; transition: all 0.15s; text-decoration: none; }
  .btn-primary { background: var(--green-700); color: #fff; }
  .btn-primary:hover { background: var(--green-600); transform: translateY(-1px); }
  .btn-gold { background: var(--gold-500); color: var(--green-900); }
  .btn-gold:hover { background: var(--gold-400); }
  .btn-outline { background: transparent; color: var(--green-700); border: 1.5px solid var(--green-600); }
  .btn-outline:hover { background: var(--green-50); }
  .btn-danger { background: var(--red-600); color: white; }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .btn-full { width: 100%; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }

  .form-group { margin-bottom: 14px; }
  .form-label { display: block; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 5px; }
  .form-input, .form-select { width: 100%; padding: 10px 13px; border: 1.5px solid var(--border-md); border-radius: var(--radius-md); font-family: 'Barlow', sans-serif; font-size: 15px; color: var(--text-primary); background: var(--surface); transition: border-color 0.15s; outline: none; }
  .form-input:focus, .form-select:focus { border-color: var(--green-500); box-shadow: 0 0 0 3px rgba(34,139,80,0.12); }

  .pill { display: inline-block; padding: 3px 10px; border-radius: 20px; font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  .pill-green { background: var(--green-100); color: var(--green-700); }
  .pill-gold  { background: var(--gold-100);  color: var(--gold-700); }
  .pill-red   { background: var(--red-100);   color: var(--red-600); }
  .pill-earth { background: var(--earth-100); color: var(--earth-600); }
  .pill-gray  { background: var(--earth-100); color: var(--text-muted); }
  .pill-blue  { background: #e8f0fe; color: #1a56a0; }

  /* Leaderboard */
  .leaderboard-row { display: flex; align-items: center; padding: 11px 14px; border-radius: var(--radius-md); margin-bottom: 4px; background: var(--surface); border: 1px solid var(--border); transition: background 0.15s; }
  .leaderboard-row:hover { background: var(--green-50); }
  .lb-rank { font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 700; color: var(--earth-400); min-width: 36px; flex-shrink: 0; }
  .lb-rank.top1 { color: var(--gold-500); }
  .lb-rank.top2 { color: #8e8e8e; }
  .lb-name { flex: 1; font-size: 15px; font-weight: 500; color: var(--text-primary); min-width: 0; }
  .lb-hcp { font-size: 12px; color: var(--text-muted); font-weight: 400; margin-top: 1px; }
  .lb-score { font-family: 'Barlow Condensed', sans-serif; font-size: 26px; font-weight: 700; color: var(--green-700); min-width: 44px; text-align: right; flex-shrink: 0; }
  .lb-pts-label { font-size: 11px; color: var(--text-muted); text-align: right; }

  /* Score grid — scrollable horizontally inside fixed shell */
  .score-grid { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .score-table { min-width: 320px; border-collapse: collapse; font-size: 13px; }
  .score-table th { background: var(--green-900); color: var(--gold-300); font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; padding: 7px 6px; text-align: center; white-space: nowrap; }
  .score-table td { padding: 7px 4px; text-align: center; border-bottom: 1px solid var(--border); font-size: 13px; }
  .score-table tr:nth-child(even) td { background: var(--surface2); }
  .score-input-cell input { width: 36px; padding: 4px 2px; text-align: center; border: 1.5px solid var(--border-md); border-radius: 5px; font-size: 14px; font-family: 'Barlow', sans-serif; }
  .score-input-cell input:focus { border-color: var(--green-500); outline: none; box-shadow: 0 0 0 2px rgba(34,139,80,0.15); }
  .pts-eagle { background: var(--gold-100); color: var(--gold-800); font-weight: 700; }
  .pts-birdie { background: var(--green-100); color: var(--green-700); font-weight: 700; }
  .pts-par { background: #f0f0f0; color: #555; }
  .pts-bogey { background: #fff3e0; color: #b35c00; }
  .pts-zero { background: var(--red-100); color: var(--red-600); }

  .stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-bottom: 14px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px 12px; text-align: center; }
  .stat-value { font-family: 'Barlow Condensed', sans-serif; font-size: 30px; font-weight: 700; color: var(--green-700); line-height: 1; margin-bottom: 4px; }
  .stat-label { font-size: 12px; color: var(--text-muted); font-weight: 500; letter-spacing: 0.03em; }

  .toggle-group { display: flex; background: var(--earth-100); border-radius: var(--radius-md); padding: 3px; margin-bottom: 16px; }
  .toggle-btn { flex: 1; padding: 9px; border: none; border-radius: var(--radius-sm); background: transparent; font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); cursor: pointer; transition: all 0.2s; }
  .toggle-btn.active { background: var(--green-800); color: white; box-shadow: var(--shadow-sm); }

  .pairing-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: 8px; overflow: hidden; }
  .pairing-header { background: var(--green-800); padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; }
  .pairing-time { font-family: 'Barlow Condensed', sans-serif; font-size: 14px; font-weight: 700; color: var(--gold-300); letter-spacing: 0.06em; }
  .pairing-group { font-family: 'Barlow Condensed', sans-serif; font-size: 12px; color: var(--green-300); letter-spacing: 0.08em; text-transform: uppercase; }
  .pairing-body { padding: 10px 14px; }
  .pairing-player { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
  .pairing-player:last-child { border-bottom: none; }
  .pairing-hcp { font-family: 'Barlow Condensed', sans-serif; font-size: 13px; color: var(--green-600); font-weight: 600; }

  .rsvp-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); gap: 8px; }
  .rsvp-row:last-child { border-bottom: none; }
  .rsvp-name { font-size: 14px; font-weight: 500; flex: 1; min-width: 0; }
  .rsvp-actions { display: flex; gap: 5px; flex-shrink: 0; }
  .rsvp-btn { padding: 5px 10px; border-radius: 20px; font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; border: 1.5px solid; cursor: pointer; transition: all 0.15s; background: transparent; }
  .rsvp-btn.yes { border-color: var(--green-500); color: var(--green-700); }
  .rsvp-btn.yes.active { background: var(--green-700); color: white; border-color: var(--green-700); }
  .rsvp-btn.no { border-color: var(--red-400); color: var(--red-600); }
  .rsvp-btn.no.active { background: var(--red-600); color: white; border-color: var(--red-600); }

  .divider { border: none; border-top: 1px solid var(--border); margin: 16px 0; }

  .fin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .fin-table th { background: var(--green-50); color: var(--green-800); font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; padding: 8px 10px; text-align: left; border-bottom: 2px solid rgba(92,201,138,0.25); }
  .fin-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .fin-table tr:last-child td { border-bottom: none; }
  .money { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; color: var(--green-700); }

  /* Podium — only 2 spots now */
  .podium-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .podium-card { border-radius: var(--radius-md); padding: 14px 10px; text-align: center; border: 1px solid var(--border); }
  .podium-card.p1 { background: linear-gradient(145deg, var(--gold-50), var(--gold-100)); border-color: var(--gold-300); }
  .podium-card.p2 { background: var(--surface2); }
  .podium-pos { font-family: 'Barlow Condensed', sans-serif; font-size: 24px; font-weight: 700; color: var(--gold-500); line-height: 1; }
  .podium-card.p2 .podium-pos { color: #8e8e8e; }
  .podium-pname { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-top: 4px; line-height: 1.2; }
  .podium-pscore { font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 700; color: var(--green-700); margin-top: 2px; }
  .podium-payout { font-size: 13px; color: var(--gold-600); font-weight: 600; margin-top: 2px; }

  .success-banner { background: var(--green-100); border: 1px solid var(--green-300); border-radius: var(--radius-md); padding: 12px 14px; color: var(--green-800); font-size: 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }

  .tab-sub { display: flex; gap: 8px; margin-bottom: 14px; overflow-x: auto; scrollbar-width: none; }
  .tab-sub::-webkit-scrollbar { display: none; }
  .tab-sub-btn { flex-shrink: 0; padding: 6px 14px; border-radius: 20px; font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; border: 1.5px solid var(--border-md); background: transparent; color: var(--text-muted); cursor: pointer; transition: all 0.15s; }
  .tab-sub-btn.active { background: var(--green-800); border-color: var(--green-800); color: white; }

  .empty-state { text-align: center; padding: 40px 20px; color: var(--text-muted); }
  .empty-text { font-size: 15px; margin-bottom: 4px; color: var(--text-secondary); }
  .empty-sub { font-size: 13px; }

  .info-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 14px; gap: 8px; }
  .info-row:last-child { border-bottom: none; }
  .info-key { color: var(--text-muted); font-weight: 400; flex-shrink: 0; }
  .info-val { font-weight: 500; color: var(--text-primary); text-align: right; min-width: 0; word-break: break-word; }

  .charity-hero { background: var(--green-900); border-radius: var(--radius-lg); padding: 24px 20px; text-align: center; margin-bottom: 12px; }
  .charity-amount { font-family: 'Playfair Display', serif; font-size: 48px; font-weight: 700; color: var(--gold-400); line-height: 1; }
  .charity-label { font-family: 'Barlow Condensed', sans-serif; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--green-300); margin-top: 6px; }

  /* Hcp sheet table */
  .hcp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .hcp-table th { background: var(--green-900); color: var(--gold-300); font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 700; padding: 8px 6px; text-align: center; white-space: nowrap; }
  .hcp-table th:first-child { text-align: left; padding-left: 10px; }
  .hcp-table td { padding: 8px 6px; border-bottom: 1px solid var(--border); text-align: center; font-size: 13px; }
  .hcp-table td:first-child { text-align: left; padding-left: 10px; font-weight: 500; }
  .hcp-table tr:nth-child(even) td { background: var(--surface2); }

  /* Guest tag */
  .guest-tag { font-size: 11px; color: var(--gold-700); background: var(--gold-50); border: 1px solid var(--gold-200, #ffeea0); border-radius: 4px; padding: 1px 5px; margin-left: 4px; font-family: 'Barlow Condensed', sans-serif; }
`;

// ============================================================
// SEED DATA
// ============================================================
const INITIAL_GOLFERS = [
  { golfer_id: 1,  first_name: "Mark",    last_name: "Stein",      email_address: "mark@example.com",    current_handicap_index: 12.4, is_guest: false, status: "Active" },
  { golfer_id: 2,  first_name: "Trevor",  last_name: "Gnesin",     email_address: "trevor.g@example.com",current_handicap_index: 23.0, is_guest: false, status: "Active" },
  { golfer_id: 3,  first_name: "Stuart",  last_name: "Solkow",     email_address: "stuart@example.com",  current_handicap_index: 12.0, is_guest: false, status: "Active" },
  { golfer_id: 4,  first_name: "Trevor",  last_name: "Colley",     email_address: "trevor.c@example.com",current_handicap_index: 14.3, is_guest: false, status: "Active" },
  { golfer_id: 5,  first_name: "Tony",    last_name: "Del Duca",   email_address: "tony@example.com",    current_handicap_index: 8.0,  is_guest: false, status: "Active" },
  { golfer_id: 6,  first_name: "Dave",    last_name: "Metz",       email_address: "dave@example.com",    current_handicap_index: 14.8, is_guest: false, status: "Active" },
  { golfer_id: 7,  first_name: "Skyler",  last_name: "Riley",      email_address: "skyler@example.com",  current_handicap_index: 9.3,  is_guest: false, status: "Active" },
  { golfer_id: 8,  first_name: "Don",     last_name: "Blaustein",  email_address: "don@example.com",     current_handicap_index: 16.2, is_guest: false, status: "Active" },
  { golfer_id: 9,  first_name: "Joe",     last_name: "Fishman",    email_address: "joe@example.com",     current_handicap_index: 19.0, is_guest: false, status: "Active" },
  { golfer_id: 10, first_name: "Jake",    last_name: "Ritter",     email_address: "jake@example.com",    current_handicap_index: 1.0,  is_guest: false, status: "Active" },
  { golfer_id: 11, first_name: "Pete",    last_name: "Grande",     email_address: "pete@example.com",    current_handicap_index: 12.0, is_guest: false, status: "Active" },
  { golfer_id: 12, first_name: "Errol",   last_name: "Kaplan",     email_address: "errol@example.com",   current_handicap_index: 19.1, is_guest: false, status: "Active" },
];

// courses_and_tees: multiple tee rows per course_name
// course_id is unique per tee box; course_name groups them for analytics (#6)
const INITIAL_COURSES = [
  {
    course_id: 1, course_name: "Strawberry Farms GC", tee_box_name: "Black",
    tee_slope: 132, tee_rating: 74.1, par: 71,
    hole_pars: [4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,3],
    hole_stroke_indices: [5,13,17,3,11,7,15,1,9,6,16,2,10,8,18,4,14,12],
  },
  {
    course_id: 2, course_name: "Strawberry Farms GC", tee_box_name: "Blue",
    tee_slope: 126, tee_rating: 72.3, par: 71,
    hole_pars: [4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,3],
    hole_stroke_indices: [5,13,17,3,11,7,15,1,9,6,16,2,10,8,18,4,14,12],
  },
  {
    course_id: 3, course_name: "Strawberry Farms GC", tee_box_name: "White",
    tee_slope: 119, tee_rating: 70.1, par: 71,
    hole_pars: [4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,3],
    hole_stroke_indices: [5,13,17,3,11,7,15,1,9,6,16,2,10,8,18,4,14,12],
  },
  {
    course_id: 4, course_name: "Oak Creek GC", tee_box_name: "Blue",
    tee_slope: 133, tee_rating: 73.8, par: 72,
    hole_pars: [5,4,3,4,4,5,4,3,4,4,4,3,5,4,4,3,5,4],
    hole_stroke_indices: [3,11,17,7,13,1,9,15,5,10,16,18,2,12,6,14,4,8],
  },
  {
    course_id: 5, course_name: "Oak Creek GC", tee_box_name: "White",
    tee_slope: 124, tee_rating: 71.5, par: 72,
    hole_pars: [5,4,3,4,4,5,4,3,4,4,4,3,5,4,4,3,5,4],
    hole_stroke_indices: [3,11,17,7,13,1,9,15,5,10,16,18,2,12,6,14,4,8],
  },
];

// Events reference course_name (not course_id) for the venue; tee boxes are per player
const INITIAL_EVENTS = [
  { event_id: 1, date: "2026-05-16", course_name: "Strawberry Farms GC", tee_times: ["08:00","08:10","08:20","08:30"], status: "Completed" },
  { event_id: 2, date: "2026-05-23", course_name: "Strawberry Farms GC", tee_times: ["08:00","08:10","08:20"], status: "Pairings Set" },
  { event_id: 3, date: "2026-05-30", course_name: "Oak Creek GC",          tee_times: ["08:00","08:10","08:20"], status: "Upcoming" },
  { event_id: 4, date: "2026-06-06", course_name: "Strawberry Farms GC", tee_times: ["08:00","08:10","08:20"], status: "Upcoming" },
];

// signups: tee_box_course_id references courses table for the player's specific tee choice
const INITIAL_SIGNUPS = [
  // Event 1 – completed
  { signup_id:1,  event_id:1, golfer_id:1,  attending:"Yes", assigned_tee_time:"08:00", tee_box_course_id:2, playing_handicap:13, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:2,  event_id:1, golfer_id:2,  attending:"Yes", assigned_tee_time:"08:00", tee_box_course_id:3, playing_handicap:22, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:3,  event_id:1, golfer_id:3,  attending:"Yes", assigned_tee_time:"08:00", tee_box_course_id:2, playing_handicap:12, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:4,  event_id:1, golfer_id:4,  attending:"Yes", assigned_tee_time:"08:00", tee_box_course_id:2, playing_handicap:15, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:5,  event_id:1, golfer_id:5,  attending:"Yes", assigned_tee_time:"08:10", tee_box_course_id:1, playing_handicap:7,  is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:6,  event_id:1, golfer_id:6,  attending:"Yes", assigned_tee_time:"08:10", tee_box_course_id:2, playing_handicap:15, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:7,  event_id:1, golfer_id:7,  attending:"Yes", assigned_tee_time:"08:10", tee_box_course_id:2, playing_handicap:9,  is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:8,  event_id:1, golfer_id:8,  attending:"Yes", assigned_tee_time:"08:10", tee_box_course_id:3, playing_handicap:16, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:9,  event_id:1, golfer_id:9,  attending:"Yes", assigned_tee_time:"08:20", tee_box_course_id:3, playing_handicap:19, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:10, event_id:1, golfer_id:10, attending:"Yes", assigned_tee_time:"08:20", tee_box_course_id:1, playing_handicap:0,  is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:11, event_id:1, golfer_id:11, attending:"Yes", assigned_tee_time:"08:20", tee_box_course_id:2, playing_handicap:12, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:12, event_id:1, golfer_id:12, attending:"Yes", assigned_tee_time:"08:30", tee_box_course_id:3, playing_handicap:19, is_guest_entry:false, sponsor_golfer_id:null },
  // Event 2 – pairings set
  { signup_id:13, event_id:2, golfer_id:1,  attending:"Yes", assigned_tee_time:"08:00", tee_box_course_id:2, playing_handicap:13, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:14, event_id:2, golfer_id:2,  attending:"Yes", assigned_tee_time:"08:00", tee_box_course_id:3, playing_handicap:22, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:15, event_id:2, golfer_id:3,  attending:"Yes", assigned_tee_time:"08:00", tee_box_course_id:2, playing_handicap:12, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:16, event_id:2, golfer_id:4,  attending:"Yes", assigned_tee_time:"08:00", tee_box_course_id:2, playing_handicap:15, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:17, event_id:2, golfer_id:5,  attending:"No",  assigned_tee_time:null,    tee_box_course_id:null, playing_handicap:null, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:18, event_id:2, golfer_id:6,  attending:"Yes", assigned_tee_time:"08:10", tee_box_course_id:2, playing_handicap:15, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:19, event_id:2, golfer_id:7,  attending:"Yes", assigned_tee_time:"08:10", tee_box_course_id:2, playing_handicap:9,  is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:20, event_id:2, golfer_id:8,  attending:"Yes", assigned_tee_time:"08:10", tee_box_course_id:3, playing_handicap:16, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:21, event_id:2, golfer_id:9,  attending:"Yes", assigned_tee_time:"08:10", tee_box_course_id:3, playing_handicap:19, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:22, event_id:2, golfer_id:10, attending:"Yes", assigned_tee_time:"08:20", tee_box_course_id:1, playing_handicap:0,  is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:23, event_id:2, golfer_id:11, attending:"Yes", assigned_tee_time:"08:20", tee_box_course_id:2, playing_handicap:12, is_guest_entry:false, sponsor_golfer_id:null },
  { signup_id:24, event_id:2, golfer_id:12, attending:"Yes", assigned_tee_time:"08:20", tee_box_course_id:3, playing_handicap:19, is_guest_entry:false, sponsor_golfer_id:null },
  // Event 3 – upcoming
  ...([1,2,3,4,5,6,7,8,9,10,11,12]).map((gid, i) => ({
    signup_id: 25+i, event_id:3, golfer_id:gid, attending:"Unconfirmed",
    assigned_tee_time:null, tee_box_course_id:null, playing_handicap:null,
    is_guest_entry:false, sponsor_golfer_id:null,
  })),
  // Event 4 – upcoming
  ...([1,2,3,4,5,6,7,8,9,10,11,12]).map((gid, i) => ({
    signup_id: 37+i, event_id:4, golfer_id:gid, attending:"Unconfirmed",
    assigned_tee_time:null, tee_box_course_id:null, playing_handicap:null,
    is_guest_entry:false, sponsor_golfer_id:null,
  })),
];

const INITIAL_LEADERBOARD = [
  { summary_id:1,  event_id:1, golfer_id:4,  entry_type:"Hole-by-Hole", total_stableford_points:39, buy_in_paid:true, skins_paid:true,  charity_paid:true, weekly_payout_won:300.00, skins_payout_won:0 },
  { summary_id:2,  event_id:1, golfer_id:7,  entry_type:"Hole-by-Hole", total_stableford_points:35, buy_in_paid:true, skins_paid:true,  charity_paid:true, weekly_payout_won:100.00, skins_payout_won:40.00 },
  { summary_id:3,  event_id:1, golfer_id:2,  entry_type:"Hole-by-Hole", total_stableford_points:34, buy_in_paid:true, skins_paid:true,  charity_paid:true, weekly_payout_won:0, skins_payout_won:40.00 },
  { summary_id:4,  event_id:1, golfer_id:11, entry_type:"Hole-by-Hole", total_stableford_points:32, buy_in_paid:true, skins_paid:true,  charity_paid:true, weekly_payout_won:0, skins_payout_won:20.00 },
  { summary_id:5,  event_id:1, golfer_id:9,  entry_type:"Total Only",   total_stableford_points:31, buy_in_paid:true, skins_paid:false, charity_paid:true, weekly_payout_won:0, skins_payout_won:0 },
  { summary_id:6,  event_id:1, golfer_id:1,  entry_type:"Total Only",   total_stableford_points:30, buy_in_paid:true, skins_paid:true,  charity_paid:true, weekly_payout_won:0, skins_payout_won:0 },
  { summary_id:7,  event_id:1, golfer_id:10, entry_type:"Total Only",   total_stableford_points:29, buy_in_paid:true, skins_paid:false, charity_paid:true, weekly_payout_won:0, skins_payout_won:0 },
  { summary_id:8,  event_id:1, golfer_id:6,  entry_type:"Total Only",   total_stableford_points:28, buy_in_paid:true, skins_paid:true,  charity_paid:true, weekly_payout_won:0, skins_payout_won:0 },
  { summary_id:9,  event_id:1, golfer_id:3,  entry_type:"Total Only",   total_stableford_points:27, buy_in_paid:true, skins_paid:false, charity_paid:true, weekly_payout_won:0, skins_payout_won:0 },
  { summary_id:10, event_id:1, golfer_id:8,  entry_type:"Total Only",   total_stableford_points:26, buy_in_paid:true, skins_paid:true,  charity_paid:true, weekly_payout_won:0, skins_payout_won:0 },
  { summary_id:11, event_id:1, golfer_id:5,  entry_type:"Total Only",   total_stableford_points:24, buy_in_paid:true, skins_paid:false, charity_paid:false,weekly_payout_won:0, skins_payout_won:0 },
  { summary_id:12, event_id:1, golfer_id:12, entry_type:"Total Only",   total_stableford_points:22, buy_in_paid:true, skins_paid:false, charity_paid:true, weekly_payout_won:0, skins_payout_won:0 },
];

const INITIAL_HOLE_SCORES: any[] = [];

// Historical rounds for analytics seeding
const EXTRA_ROUNDS_BY_GOLFER: Record<number, number[]> = {
  1: [31,29,28,33,30,27,32,34,29,28,30,31,27,26],
  2: [25,24,26,25,23,25,24,26,25,24,26,25,24,23],
  3: [31,30,28,33,29,30,32,31,29,28,31,30,32,31],
  4: [30,29,31,28,32,30,29,31,30,28,29,31,32,30],
  5: [34,35,33,36,34,35,33,36,34,35,33,34,35,36],
  6: [29,28,30,27,31,29,28,30,29,27,28,30,31,29],
  7: [32,33,31,34,32,33,31,34,32,33,31,32,33,34],
  8: [26,25,28,27,24,26,25,28,26,24,27,25,26,28],
  9: [25,24,26,23,27,25,24,26,25,23,24,26,27,25],
  10: [35,36,34,37,35,36,34,37,35,36,34,35,36,37],
  11: [31,30,32,29,33,31,30,32,31,29,30,32,33,31],
  12: [24,23,25,22,26,24,23,25,24,22,23,25,26,24],
};

// ============================================================
// BUSINESS LOGIC
// ============================================================
function calcPlayingHandicap(hcpIndex: number, slope: number, rating: number, par: number): number {
  return Math.round(hcpIndex * (slope / 113) + (rating - par));
}

function calcHoleNetScore(gross: number, playingHcp: number, strokeIndex: number): number {
  const base = Math.floor(playingHcp / 18);
  const extra = playingHcp % 18;
  const strokes = base + (strokeIndex <= extra ? 1 : 0);
  return gross - strokes;
}

function calcStablefordPoints(net: number, par: number): number {
  const d = net - par;
  if (d <= -2) return 4;
  if (d === -1) return 3;
  if (d === 0)  return 2;
  if (d === 1)  return 1;
  return 0;
}

function calcHoleScores(
  grossScores: (string|number)[],
  playingHcp: number,
  course: typeof INITIAL_COURSES[0]
) {
  return grossScores.map((g, i) => {
    const gross = g ? parseInt(String(g)) : null;
    if (!gross) return { gross: null, net: null, points: null };
    const net = calcHoleNetScore(gross, playingHcp, course.hole_stroke_indices[i]);
    const points = calcStablefordPoints(net, course.hole_pars[i]);
    return { gross, net, points };
  });
}

function runPairingEngine(
  attendees: { golfer_id: number; sponsor_golfer_id: number | null }[],
  teeTimes: string[]
) {
  // Group guests with their sponsor first
  const sponsorMap: Record<number, number[]> = {};
  const soloIds: number[] = [];
  attendees.forEach(a => {
    if (a.sponsor_golfer_id) {
      if (!sponsorMap[a.sponsor_golfer_id]) sponsorMap[a.sponsor_golfer_id] = [];
      sponsorMap[a.sponsor_golfer_id].push(a.golfer_id);
    } else {
      soloIds.push(a.golfer_id);
    }
  });
  // Build seed groups: [sponsor, ...guests]
  const seeds: number[][] = [];
  soloIds.forEach(id => {
    const guests = sponsorMap[id] || [];
    seeds.push([id, ...guests]);
  });
  // Flatten into ordered pool, keeping sponsor+guest pairs together
  const pool = seeds.flat();
  const N = pool.length;
  const G = Math.ceil(N / 4);
  const base = Math.floor(N / G);
  const R = N % G;
  // Shuffle seeds (not individual players) to keep pairs
  const shuffledSeeds = [...seeds].sort(() => Math.random() - 0.5);
  const poolShuffled = shuffledSeeds.flat();
  const groups: number[][] = [];
  let idx = 0;
  for (let g = 0; g < G; g++) {
    const size = g < R ? base + 1 : base;
    groups.push(poolShuffled.slice(idx, idx + size));
    idx += size;
  }
  return groups.map((players, i) => ({ teeTime: teeTimes[i] || teeTimes[teeTimes.length - 1], players }));
}

function golferName(golfers: typeof INITIAL_GOLFERS, id: number) {
  const g = golfers.find(x => x.golfer_id === id);
  return g ? `${g.first_name} ${g.last_name}` : "Guest";
}
function formatDate(d: string) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function uniqueCourseNames(courses: typeof INITIAL_COURSES) {
  return [...new Set(courses.map(c => c.course_name))];
}
function teeBoxesForCourse(courses: typeof INITIAL_COURSES, courseName: string) {
  return courses.filter(c => c.course_name === courseName);
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const [golfers, setGolfers] = useState(INITIAL_GOLFERS);
  const [courses] = useState(INITIAL_COURSES);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [signups, setSignups] = useState(INITIAL_SIGNUPS);
  const [leaderboard, setLeaderboard] = useState(INITIAL_LEADERBOARD);
  const [holeScores, setHoleScores] = useState(INITIAL_HOLE_SCORES);
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [adminMode, setAdminMode] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3500);
  }, []);

  const tabs = adminMode
    ? [
        { id: "leaderboard", label: "Leaderboard" },
        { id: "rsvp", label: "Sign Up" },
        { id: "score", label: "Scoring" },
        { id: "admin", label: "⚙ Admin" },
        { id: "analytics", label: "Analytics" },
      ]
    : [
        { id: "leaderboard", label: "Leaderboard" },
        { id: "rsvp", label: "Sign Up" },
        { id: "score", label: "Scoring" },
        { id: "analytics", label: "Analytics" },
      ];

  return (
    <>
      <style>{CSS}</style>
      <div className="app-shell">
        <header className="app-header">
          <div className="header-top">
            <div className="brand">
              <div className="brand-name">Saturday School</div>
              <div className="brand-tagline">Stableford Golf League</div>
            </div>
            <button
              className="header-badge"
              style={{ background: adminMode ? "#c02020" : undefined }}
              onClick={() => setAdminMode(v => !v)}
            >
              {adminMode ? "Exit Admin" : "Admin"}
            </button>
          </div>
          <nav className="nav-tabs">
            {tabs.map(t => (
              <button
                key={t.id}
                className={`nav-tab${activeTab === t.id ? " active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >{t.label}</button>
            ))}
          </nav>
        </header>

        <main className="main-content">
          {successMsg && <div className="success-banner"><span>✓</span>{successMsg}</div>}
          {activeTab === "leaderboard" && <LeaderboardTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} signups={signups} />}
          {activeTab === "rsvp" && <RSVPTab golfers={golfers} events={events} signups={signups} setSignups={setSignups} showSuccess={showSuccess} adminMode={adminMode} />}
          {activeTab === "score" && <ScoreEntryTab golfers={golfers} courses={courses} events={events} signups={signups} leaderboard={leaderboard} setLeaderboard={setLeaderboard} holeScores={holeScores} setHoleScores={setHoleScores} setEvents={setEvents} showSuccess={showSuccess} />}
          {activeTab === "admin" && adminMode && <AdminTab golfers={golfers} setGolfers={setGolfers} courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} leaderboard={leaderboard} showSuccess={showSuccess} />}
          {activeTab === "analytics" && <AnalyticsTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} />}
        </main>
      </div>
    </>
  );
}

// ============================================================
// LEADERBOARD TAB
// ============================================================
function LeaderboardTab({ golfers, courses, events, leaderboard, signups }: any) {
  const [subTab, setSubTab] = useState("current");
  const [selEventId, setSelEventId] = useState<number|null>(null);

  const completedEvents = [...events].filter((e:any) => e.status === "Completed").sort((a:any,b:any) => new Date(b.date).getTime()-new Date(a.date).getTime());
  const displayEvent = selEventId ? completedEvents.find((e:any) => e.event_id === selEventId) : completedEvents[0];

  const eventEntries = displayEvent
    ? [...leaderboard.filter((e:any) => e.event_id === displayEvent.event_id)].sort((a:any,b:any) => b.total_stableford_points - a.total_stableford_points)
    : [];

  // Determine 1st/2nd with tie handling
  const paidEntries = eventEntries.filter((e:any) => e.buy_in_paid);
  const paidCount = paidEntries.length;
  const totalPot = paidCount * 20;
  const first1stPts = paidEntries[0]?.total_stableford_points;
  const tied1st = paidEntries.filter((e:any) => e.total_stableford_points === first1stPts);

  const buildSeasonData = (filterFn = (r:any) => true) => {
    const byG: Record<number, number[]> = {};
    leaderboard.forEach((r:any) => {
      const g = golfers.find((x:any) => x.golfer_id === r.golfer_id);
      if (!g || g.is_guest || !filterFn(r)) return;
      (byG[r.golfer_id] = byG[r.golfer_id] || []).push(r.total_stableford_points);
    });
    Object.entries(EXTRA_ROUNDS_BY_GOLFER).forEach(([gid, rounds]) => {
      const id = parseInt(gid);
      const g = golfers.find((x:any) => x.golfer_id === id);
      if (!g || g.is_guest) return;
      (byG[id] = byG[id] || []).push(...rounds);
    });
    return byG;
  };

  const seasonAvg = (() => {
    const byG = buildSeasonData();
    return Object.entries(byG).filter(([,r]) => r.length >= 15)
      .map(([gid, r]) => ({ golfer_id: parseInt(gid), avg: r.reduce((a,b)=>a+b,0)/r.length, rounds: r.length }))
      .sort((a,b) => b.avg - a.avg);
  })();

  const top15Avg = (() => {
    const byG = buildSeasonData();
    return Object.entries(byG).filter(([,r]) => r.length >= 15)
      .map(([gid, r]) => {
        const top = [...r].sort((a,b)=>b-a).slice(0,15);
        return { golfer_id: parseInt(gid), avg: top.reduce((a,b)=>a+b,0)/top.length, rounds: r.length };
      })
      .sort((a,b) => b.avg - a.avg);
  })();

  const skinsPot = displayEvent ? leaderboard.filter((e:any) => e.event_id === displayEvent.event_id && e.skins_paid).length * 10 : 0;

  return (
    <div>
      <div className="section-title">Leaderboard</div>
      <div className="section-sub">2026 Season · Saturday School</div>

      <div className="tab-sub">
        {[{id:"current",label:"Event"},{id:"season",label:"Season Avg"},{id:"top15",label:"Top 15 Avg"},{id:"finance",label:"Payouts"}].map(t=>(
          <button key={t.id} className={`tab-sub-btn${subTab===t.id?" active":""}`} onClick={()=>setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {subTab === "current" && (
        <>
          <div className="form-group">
            <label className="form-label">Event</label>
            <select className="form-select" value={displayEvent?.event_id||""} onChange={e=>setSelEventId(parseInt(e.target.value))}>
              {completedEvents.map((ev:any)=>(
                <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>
              ))}
            </select>
          </div>
          {displayEvent && (
            <>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-value">{paidCount}</div><div className="stat-label">Players</div></div>
                <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)"}}>$&thinsp;{totalPot}</div><div className="stat-label">Stableford Pot</div></div>
              </div>

              {/* FIX #3 – only show 1st and 2nd */}
              {eventEntries.length >= 2 && (
                <div className="podium-row">
                  {eventEntries.slice(0,2).map((e:any,i:number) => {
                    const pct = i===0 ? (tied1st.length>1?1.0:0.75) : 0.25;
                    const payout = (totalPot * pct / (i===0?tied1st.length:1)).toFixed(0);
                    return (
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

              {eventEntries.map((entry:any,i:number)=>{
                const g = golfers.find((x:any)=>x.golfer_id===entry.golfer_id);
                const rankClass = i===0?"top1":i===1?"top2":"";
                return (
                  <div key={entry.summary_id} className="leaderboard-row">
                    <div className={`lb-rank ${rankClass}`}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="lb-name">{golferName(golfers,entry.golfer_id)}</div>
                      <div className="lb-hcp">HCP {g?.current_handicap_index?.toFixed(1)} · {entry.entry_type==="Hole-by-Hole"?"H×H":"Total"}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                      {entry.weekly_payout_won>0 && <span className="pill pill-gold">${entry.weekly_payout_won.toFixed(0)}</span>}
                      {entry.skins_payout_won>0 && <span className="pill pill-green">Skin ${entry.skins_payout_won.toFixed(0)}</span>}
                      <div className="lb-score">{entry.total_stableford_points}</div>
                      <div className="lb-pts-label">pts</div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {subTab === "season" && (
        <>
          <div className="card" style={{padding:"10px 14px",marginBottom:12}}>
            <p style={{fontSize:13,color:"var(--text-muted)"}}>Season average across all rounds. Min 15 rounds required. Guests excluded.</p>
          </div>
          {seasonAvg.length===0 && <div className="empty-state"><div className="empty-text">No qualifying golfers yet</div><div className="empty-sub">Requires 15+ rounds</div></div>}
          {seasonAvg.map((row:any,i:number)=>{
            const g = golfers.find((x:any)=>x.golfer_id===row.golfer_id);
            return (
              <div key={row.golfer_id} className="leaderboard-row">
                <div className={`lb-rank ${i===0?"top1":i===1?"top2":""}`}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="lb-name">{golferName(golfers,row.golfer_id)}</div>
                  <div className="lb-hcp">HCP {g?.current_handicap_index?.toFixed(1)} · {row.rounds} rounds</div>
                </div>
                <div><div className="lb-score">{row.avg.toFixed(1)}</div><div className="lb-pts-label">avg pts</div></div>
              </div>
            );
          })}
        </>
      )}

      {subTab === "top15" && (
        <>
          <div className="card" style={{padding:"10px 14px",marginBottom:12}}>
            <p style={{fontSize:13,color:"var(--text-muted)"}}>Average of best 15 rounds per golfer. Min 15 rounds required.</p>
          </div>
          {top15Avg.map((row:any,i:number)=>{
            const g = golfers.find((x:any)=>x.golfer_id===row.golfer_id);
            return (
              <div key={row.golfer_id} className="leaderboard-row">
                <div className={`lb-rank ${i===0?"top1":i===1?"top2":""}`}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="lb-name">{golferName(golfers,row.golfer_id)}</div>
                  <div className="lb-hcp">HCP {g?.current_handicap_index?.toFixed(1)} · {row.rounds} rounds</div>
                </div>
                <div><div className="lb-score">{row.avg.toFixed(1)}</div><div className="lb-pts-label">top 15</div></div>
              </div>
            );
          })}
        </>
      )}

      {subTab === "finance" && (
        <FinanceView golfers={golfers} leaderboard={leaderboard} events={completedEvents} />
      )}
    </div>
  );
}

function FinanceView({ golfers, leaderboard, events }: any) {
  const [selEventId, setSelEventId] = useState(events[0]?.event_id || null);
  const entries = leaderboard.filter((e:any) => e.event_id === selEventId);
  const paidIn = entries.filter((e:any) => e.buy_in_paid).length;
  const skinsPaid = entries.filter((e:any) => e.skins_paid).length;
  const charityPaid = entries.filter((e:any) => e.charity_paid).length;
  const totalPot = paidIn * 20;
  const skinsPot = skinsPaid * 10;
  const charityPot = charityPaid * 5;
  const allCharity = leaderboard.filter((e:any) => e.charity_paid).length;

  return (
    <div>
      <div className="charity-hero">
        <div className="charity-label">Lifetime Charity Pot</div>
        <div className="charity-amount">${allCharity * 5}</div>
        <div className="charity-label" style={{marginTop:4}}>{allCharity} charity entries</div>
      </div>

      <div className="form-group">
        <label className="form-label">Event</label>
        <select className="form-select" value={selEventId||""} onChange={e=>setSelEventId(parseInt(e.target.value))}>
          {events.map((ev:any)=>(
            <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>
          ))}
        </select>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-value">${totalPot}</div><div className="stat-label">Stableford Pot</div></div>
        <div className="stat-card"><div className="stat-value">${skinsPot}</div><div className="stat-label">Skins Pot</div></div>
        <div className="stat-card"><div className="stat-value">${charityPot}</div><div className="stat-label">Charity</div></div>
        <div className="stat-card"><div className="stat-value">${totalPot+skinsPot+charityPot}</div><div className="stat-label">Total Collected</div></div>
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
// RSVP / SIGN-UP TAB  (fixes #4, #4b, #4c)
// ============================================================
function RSVPTab({ golfers, events, signups, setSignups, showSuccess, adminMode }: any) {
  // FIX #4 — show ALL future events, not just the nearest one
  const upcomingEvents = [...events]
    .filter((e:any) => e.status !== "Completed")
    .sort((a:any,b:any) => new Date(a.date).getTime()-new Date(b.date).getTime());

  const [selEventId, setSelEventId] = useState<number>(upcomingEvents[0]?.event_id || 0);
  // Guest add form
  const [guestName, setGuestName] = useState("");
  const [guestSponsor, setGuestSponsor] = useState("");
  const [guestHcp, setGuestHcp] = useState("18");

  const selEvent = events.find((e:any) => e.event_id === selEventId);
  const eventSignups = signups.filter((s:any) => s.event_id === selEventId);
  const yesCount = eventSignups.filter((s:any) => s.attending === "Yes").length;
  const noCount = eventSignups.filter((s:any) => s.attending === "No").length;
  const unconfCount = eventSignups.filter((s:any) => s.attending === "Unconfirmed").length;

  const updateAttending = (signup_id: number, val: string, gid: number) => {
    setSignups((prev:any) => prev.map((s:any) => s.signup_id === signup_id ? {...s, attending: val} : s));
    showSuccess(`RSVP updated for ${golferName(golfers, gid)}`);
  };

  const addGuest = () => {
    if (!guestName.trim() || !guestSponsor) return;
    const [fn, ...rest] = guestName.trim().split(" ");
    const ln = rest.join(" ") || "Guest";
    const newGolferId = Date.now();
    const sponsor = parseInt(guestSponsor);
    // Add to golfers list temporarily
    const newGolfer = { golfer_id: newGolferId, first_name: fn, last_name: ln, email_address: "", current_handicap_index: parseFloat(guestHcp)||18, is_guest: true, status: "Active" };
    // We bubble up through setSignups; the golfers state change happens in parent via callback — for now add inline
    // Create signup
    const newSignup = {
      signup_id: Date.now()+1, event_id: selEventId, golfer_id: newGolferId,
      attending: "Yes", assigned_tee_time: null, tee_box_course_id: null,
      playing_handicap: null, is_guest_entry: true, sponsor_golfer_id: sponsor,
    };
    // We need to also persist guest golfer — use a shared hack via a custom event
    window.dispatchEvent(new CustomEvent("addGolfer", { detail: newGolfer }));
    setSignups((prev:any) => [...prev, newSignup]);
    setGuestName(""); setGuestSponsor(""); setGuestHcp("18");
    showSuccess(`Guest ${fn} ${ln} added under ${golferName(golfers, sponsor)}`);
  };

  // Build email reminder body
  const buildReminderBody = () => {
    if (!selEvent) return "";
    const going = eventSignups.filter((s:any) => s.attending==="Yes").map((s:any) => golferName(golfers,s.golfer_id));
    const out = eventSignups.filter((s:any) => s.attending==="No").map((s:any) => golferName(golfers,s.golfer_id));
    const unconf = eventSignups.filter((s:any) => s.attending==="Unconfirmed").map((s:any) => golferName(golfers,s.golfer_id));
    return `Saturday School – RSVP Reminder\n${formatDate(selEvent.date)} @ ${selEvent.course_name}\n\n✅ Going (${going.length}):\n${going.map(n=>`  • ${n}`).join("\n")}\n\n❓ No response yet (${unconf.length}):\n${unconf.map(n=>`  • ${n}`).join("\n")}\n\n❌ Not attending (${out.length}):\n${out.map(n=>`  • ${n}`).join("\n")}\n\nPlease update your RSVP!`;
  };

  const allEmails = golfers.filter((g:any) => !g.is_guest && g.status==="Active" && g.email_address).map((g:any)=>g.email_address);
  const mailtoLink = `mailto:?bcc=${allEmails.join(",")}&subject=Saturday School – RSVP Reminder ${formatDate(selEvent?.date)}&body=${encodeURIComponent(buildReminderBody())}`;

  if (upcomingEvents.length === 0) return <div className="empty-state"><div className="empty-text">No upcoming events</div></div>;

  return (
    <div>
      <div className="section-title">Sign Up</div>
      <div className="section-sub">RSVP for upcoming rounds</div>

      {/* FIX #4 — event selector */}
      <div className="form-group">
        <label className="form-label">Select Event</label>
        <select className="form-select" value={selEventId} onChange={e=>setSelEventId(parseInt(e.target.value))}>
          {upcomingEvents.map((ev:any) => (
            <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>
          ))}
        </select>
      </div>

      {selEvent && (
        <div className="card" style={{padding:"10px 14px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontWeight:600,fontSize:15}}>{selEvent.course_name}</div>
            <div style={{display:"flex",gap:4}}>
              <span className="pill pill-green">✓ {yesCount}</span>
              {noCount>0&&<span className="pill pill-red">✗ {noCount}</span>}
              {unconfCount>0&&<span className="pill pill-gray">? {unconfCount}</span>}
            </div>
          </div>
          <div className="info-row"><span className="info-key">Status</span><span className="pill pill-gold">{selEvent.status}</span></div>
          <div className="info-row"><span className="info-key">First tee</span><span className="info-val">{selEvent.tee_times[0]}</span></div>
        </div>
      )}

      <div className="card-title" style={{marginBottom:10}}>Member RSVPs</div>
      {eventSignups
        .filter((s:any) => !s.is_guest_entry)
        .map((signup:any) => {
          const g = golfers.find((x:any) => x.golfer_id === signup.golfer_id);
          if (!g) return null;
          // Show guests sponsored by this golfer
          const myGuests = eventSignups.filter((s:any) => s.is_guest_entry && s.sponsor_golfer_id === g.golfer_id);
          return (
            <div key={signup.signup_id}>
              <div className="rsvp-row">
                <div className="rsvp-name" style={{flex:1,minWidth:0}}>
                  {g.first_name} {g.last_name}
                  {myGuests.length>0 && <span className="guest-tag">+{myGuests.length} guest{myGuests.length>1?"s":""}</span>}
                </div>
                <div className="rsvp-actions">
                  <button className={`rsvp-btn yes${signup.attending==="Yes"?" active":""}`} onClick={()=>updateAttending(signup.signup_id,"Yes",g.golfer_id)}>In</button>
                  <button className={`rsvp-btn no${signup.attending==="No"?" active":""}`} onClick={()=>updateAttending(signup.signup_id,"No",g.golfer_id)}>Out</button>
                </div>
              </div>
              {myGuests.map((gs:any) => {
                const gg = golfers.find((x:any) => x.golfer_id === gs.golfer_id);
                return (
                  <div key={gs.signup_id} className="rsvp-row" style={{paddingLeft:16,background:"var(--gold-50)"}}>
                    <div className="rsvp-name" style={{flex:1,fontSize:13,color:"var(--gold-800)"}}>
                      ↳ {gg ? `${gg.first_name} ${gg.last_name}` : "Guest"} <span className="guest-tag">guest</span>
                    </div>
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

      {/* FIX #4b – add guest */}
      <hr className="divider" />
      <div className="card-title" style={{marginBottom:10}}>Add Guest</div>
      <div className="form-group">
        <label className="form-label">Guest Full Name</label>
        <input className="form-input" placeholder="First Last" value={guestName} onChange={e=>setGuestName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Sponsor (Member bringing guest)</label>
        <select className="form-select" value={guestSponsor} onChange={e=>setGuestSponsor(e.target.value)}>
          <option value="">Select member…</option>
          {golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=>(
            <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Guest Handicap Index</label>
        <input className="form-input" type="number" step="0.1" min="0" max="54" value={guestHcp} onChange={e=>setGuestHcp(e.target.value)} />
      </div>
      <button className="btn btn-gold btn-full" disabled={!guestName.trim()||!guestSponsor} onClick={addGuest}>+ Add Guest to Event</button>

      {/* FIX #4c – admin reminder email */}
      {adminMode && (
        <>
          <hr className="divider" />
          <div className="card-title" style={{marginBottom:6}}>Admin: Send Reminder</div>
          <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:10}}>Emails the full group with current RSVP status — who's in, who's out, and who hasn't responded.</p>
          <a href={mailtoLink} className="btn btn-outline btn-full" style={{textDecoration:"none"}}>✉ Send RSVP Reminder Email</a>
        </>
      )}
    </div>
  );
}

// ============================================================
// SCORE ENTRY TAB  (fix #5 – per-player tee box selection)
// ============================================================
function ScoreEntryTab({ golfers, courses, events, signups, leaderboard, setLeaderboard, holeScores, setHoleScores, setEvents, showSuccess }: any) {
  const [mode, setMode] = useState("total");
  const [selGolferId, setSelGolferId] = useState("");
  const [selEventId, setSelEventId] = useState("");
  const [selCourseId, setSelCourseId] = useState(""); // FIX #5 – per-player tee box
  const [totalPts, setTotalPts] = useState("");
  const [grossScores, setGrossScores] = useState(Array(18).fill(""));
  const [submitted, setSubmitted] = useState(false);

  const activeEvents = events.filter((e:any) => e.status === "Pairings Set" || e.status === "In-Progress");
  const selEvent = events.find((e:any) => e.event_id === parseInt(selEventId));
  // Available tee boxes = all tees for this event's course_name
  const availableTees = selEvent ? courses.filter((c:any) => c.course_name === selEvent.course_name) : [];
  const selCourse = courses.find((c:any) => c.course_id === parseInt(selCourseId));

  const signup = selEvent && selGolferId
    ? signups.find((s:any) => s.event_id === selEvent.event_id && s.golfer_id === parseInt(selGolferId))
    : null;

  // Compute playing handicap dynamically based on selected tee (FIX #5)
  const golfer = golfers.find((g:any) => g.golfer_id === parseInt(selGolferId));
  const playingHcp = golfer && selCourse
    ? calcPlayingHandicap(golfer.current_handicap_index, selCourse.tee_slope, selCourse.tee_rating, selCourse.par)
    : (signup?.playing_handicap ?? 0);

  const holeCalcs = selCourse && mode === "hole"
    ? calcHoleScores(grossScores, playingHcp, selCourse)
    : [];
  const totalCalcPts = holeCalcs.reduce((s:number, h:any) => s + (h.points ?? 0), 0);

  const alreadyEntered = selEvent && selGolferId
    ? leaderboard.some((r:any) => r.event_id === selEvent.event_id && r.golfer_id === parseInt(selGolferId))
    : false;

  // Auto-select tee when golfer or event changes (use their stored tee if available)
  useEffect(() => {
    if (!signup?.tee_box_course_id) {
      if (availableTees.length === 1) setSelCourseId(String(availableTees[0].course_id));
    } else {
      setSelCourseId(String(signup.tee_box_course_id));
    }
  }, [selGolferId, selEventId]);

  const handleSubmit = () => {
    if (!selGolferId || !selEventId || !selCourseId) return;
    const gid = parseInt(selGolferId);
    const eid = parseInt(selEvent.event_id);
    const pts = mode === "total" ? parseInt(totalPts) : totalCalcPts;
    if (!pts || pts < 0) return;

    const newSummaryId = Date.now();
    const newEntry = {
      summary_id: newSummaryId, event_id: eid, golfer_id: gid,
      entry_type: mode === "hole" ? "Hole-by-Hole" : "Total Only",
      total_stableford_points: pts,
      buy_in_paid: true, skins_paid: mode === "hole", charity_paid: true,
      weekly_payout_won: 0, skins_payout_won: 0,
    };
    if (alreadyEntered) {
      setLeaderboard((prev:any) => prev.map((r:any) => r.event_id===eid && r.golfer_id===gid ? newEntry : r));
    } else {
      setLeaderboard((prev:any) => [...prev, newEntry]);
    }
    if (mode === "hole" && selCourse) {
      const newScores = grossScores.map((g:string, i:number) => {
        if (!g) return null;
        const net = calcHoleNetScore(parseInt(g), playingHcp, selCourse.hole_stroke_indices[i]);
        const p = calcStablefordPoints(net, selCourse.hole_pars[i]);
        return { score_id: Date.now()+i, summary_id: newSummaryId, hole_number: i+1, gross_score: parseInt(g), net_score: net, stableford_points: p };
      }).filter(Boolean);
      setHoleScores((prev:any) => [...prev, ...newScores]);
    }
    showSuccess(`Score submitted: ${golferName(golfers,gid)} — ${pts} pts`);
    setSubmitted(true);
    setTotalPts(""); setGrossScores(Array(18).fill(""));
    setTimeout(() => setSubmitted(false), 2000);
  };

  const ptsClass = (pts:number|null) => {
    if (pts === null || pts === undefined) return "";
    if (pts >= 4) return "pts-eagle";
    if (pts === 3) return "pts-birdie";
    if (pts === 2) return "pts-par";
    if (pts === 1) return "pts-bogey";
    return "pts-zero";
  };

  return (
    <div>
      <div className="section-title">Score Entry</div>
      <div className="section-sub">Enter scores for today's round</div>

      <div className="toggle-group">
        <button className={`toggle-btn${mode==="total"?" active":""}`} onClick={()=>setMode("total")}>Total Only</button>
        <button className={`toggle-btn${mode==="hole"?" active":""}`} onClick={()=>setMode("hole")}>Hole by Hole</button>
      </div>

      <div className="form-group">
        <label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value); setSelCourseId("");}}>
          <option value="">Select event…</option>
          {activeEvents.map((ev:any)=>(
            <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Golfer</label>
        <select className="form-select" value={selGolferId} onChange={e=>setSelGolferId(e.target.value)}>
          <option value="">Select golfer…</option>
          {golfers.filter((g:any)=>g.status==="Active").map((g:any)=>(
            <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}{g.is_guest?" (Guest)":""}</option>
          ))}
        </select>
      </div>

      {/* FIX #5 – per-player tee box */}
      {selEvent && (
        <div className="form-group">
          <label className="form-label">Tee Box</label>
          <select className="form-select" value={selCourseId} onChange={e=>setSelCourseId(e.target.value)}>
            <option value="">Select tee…</option>
            {availableTees.map((t:any)=>(
              <option key={t.course_id} value={t.course_id}>{t.tee_box_name} — Slope {t.tee_slope} / Rating {t.tee_rating}</option>
            ))}
          </select>
        </div>
      )}

      {golfer && selCourse && (
        <div className="card" style={{padding:"10px 14px",marginBottom:12}}>
          <div className="info-row"><span className="info-key">HCP Index</span><span className="info-val">{golfer.current_handicap_index.toFixed(1)}</span></div>
          <div className="info-row"><span className="info-key">Playing HCP ({selCourse.tee_box_name})</span><span className="info-val" style={{color:"var(--green-700)",fontWeight:700,fontSize:18}}>{playingHcp}</span></div>
          <div className="info-row"><span className="info-key">Tee time</span><span className="info-val">{signup?.assigned_tee_time || "—"}</span></div>
          {alreadyEntered && <div style={{fontSize:12,color:"var(--gold-700)",marginTop:6}}>⚠ Score already entered — will be overwritten</div>}
        </div>
      )}

      {mode === "total" && (
        <div className="form-group">
          <label className="form-label">Total Stableford Points</label>
          <input className="form-input" type="number" min="0" max="72" placeholder="e.g. 36" value={totalPts} onChange={e=>setTotalPts(e.target.value)} />
        </div>
      )}

      {mode === "hole" && selCourse && (
        <div className="score-grid">
          <table className="score-table">
            <thead>
              <tr><th>Hole</th><th>Par</th><th>SI</th><th>Gross</th><th>Net</th><th>Pts</th></tr>
            </thead>
            <tbody>
              {Array.from({length:18},(_,i)=>{
                const h = holeCalcs[i] || {};
                return (
                  <tr key={i}>
                    <td style={{fontWeight:600}}>{i+1}</td>
                    <td>{selCourse.hole_pars[i]}</td>
                    <td style={{color:"var(--text-muted)"}}>{selCourse.hole_stroke_indices[i]}</td>
                    <td className="score-input-cell">
                      <input type="number" min="1" max="15" value={grossScores[i]}
                        onChange={e=>{const v=[...grossScores]; v[i]=e.target.value; setGrossScores(v);}} />
                    </td>
                    <td>{h.net??""}</td>
                    <td className={ptsClass(h.points)} style={{fontWeight:h.points!=null?700:400}}>
                      {h.points!==null&&h.points!==undefined?h.points:""}
                    </td>
                  </tr>
                );
              })}
              <tr style={{background:"var(--green-50)"}}>
                <td colSpan={3} style={{fontWeight:700,textAlign:"left",paddingLeft:8,fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,textTransform:"uppercase",letterSpacing:"0.06em"}}>Total</td>
                <td>{grossScores.reduce((s:number,v:string)=>s+(v?parseInt(v):0),0)||""}</td>
                <td></td>
                <td style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700,color:"var(--green-700)"}}>{totalCalcPts||""}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <button
        className="btn btn-primary btn-full"
        style={{marginTop:16}}
        disabled={!selGolferId||!selEventId||!selCourseId||(mode==="total"?!totalPts:totalCalcPts===0)}
        onClick={handleSubmit}
      >
        {submitted ? "✓ Submitted!" : "Submit Score"}
      </button>
    </div>
  );
}

// ============================================================
// ADMIN TAB
// ============================================================
function AdminTab({ golfers, setGolfers, courses, events, setEvents, signups, setSignups, leaderboard, showSuccess }: any) {
  const [subTab, setSubTab] = useState("hcp");

  // Listen for guest golfer additions from RSVPTab
  useEffect(() => {
    const handler = (e:any) => setGolfers((prev:any) => [...prev, e.detail]);
    window.addEventListener("addGolfer", handler);
    return () => window.removeEventListener("addGolfer", handler);
  }, []);

  return (
    <div>
      <div className="section-title">Admin</div>
      <div className="section-sub">League management tools</div>
      <div className="tab-sub">
        {[
          {id:"hcp",label:"Handicaps"},
          {id:"coursehcp",label:"Course HCPs"},
          {id:"events",label:"Events"},
          {id:"pairings",label:"Pairings"},
        ].map(t=>(
          <button key={t.id} className={`tab-sub-btn${subTab===t.id?" active":""}`} onClick={()=>setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {subTab==="hcp" && <HandicapManager golfers={golfers} setGolfers={setGolfers} showSuccess={showSuccess} />}
      {subTab==="coursehcp" && <CourseHcpSheet golfers={golfers} courses={courses} showSuccess={showSuccess} />}
      {subTab==="events" && <EventCreator courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} golfers={golfers} showSuccess={showSuccess} />}
      {subTab==="pairings" && <PairingDashboard golfers={golfers} courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} showSuccess={showSuccess} />}
    </div>
  );
}

function HandicapManager({ golfers, setGolfers, showSuccess }: any) {
  const [edits, setEdits] = useState<Record<number,string>>({});

  const handleSave = () => {
    setGolfers((prev:any) => prev.map((g:any) =>
      edits[g.golfer_id] !== undefined
        ? {...g, current_handicap_index: parseFloat(edits[g.golfer_id]) || g.current_handicap_index}
        : g
    ));
    setEdits({});
    showSuccess("Handicap indices updated");
  };

  return (
    <div>
      <div className="card-title" style={{marginBottom:10}}>Weekly Handicap Update</div>
      {golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=>(
        <div key={g.golfer_id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{flex:1,fontSize:15,fontWeight:500}}>{g.first_name} {g.last_name}</div>
          <input
            type="number" step="0.1" min="0" max="54"
            style={{width:72,padding:"7px 8px",border:"1.5px solid var(--border-md)",borderRadius:"var(--radius-md)",fontFamily:"Barlow,sans-serif",fontSize:15,textAlign:"center"}}
            value={edits[g.golfer_id]!==undefined?edits[g.golfer_id]:g.current_handicap_index}
            onChange={e=>setEdits(prev=>({...prev,[g.golfer_id]:e.target.value}))}
          />
        </div>
      ))}
      <button className="btn btn-primary btn-full" style={{marginTop:12}} onClick={handleSave}>Save All Handicaps</button>
    </div>
  );
}

// FIX #7 – Course Handicap Sheet
function CourseHcpSheet({ golfers, courses, showSuccess }: any) {
  const courseNames = uniqueCourseNames(courses);
  const [selCourseName, setSelCourseName] = useState(courseNames[0] || "");
  const tees = teeBoxesForCourse(courses, selCourseName);
  const members = golfers.filter((g:any) => !g.is_guest && g.status === "Active");

  const buildEmailBody = () => {
    let body = `Saturday School – Course Handicaps\n${selCourseName}\n\n`;
    body += `Golfer`.padEnd(20);
    tees.forEach((t:any) => { body += `  ${t.tee_box_name}`.padEnd(10); });
    body += "\n" + "-".repeat(20 + tees.length * 10) + "\n";
    members.forEach((g:any) => {
      body += `${g.first_name} ${g.last_name}`.padEnd(20);
      tees.forEach((t:any) => {
        const ph = calcPlayingHandicap(g.current_handicap_index, t.tee_slope, t.tee_rating, t.par);
        body += `  ${ph}`.padEnd(10);
      });
      body += "\n";
    });
    return body;
  };

  const allEmails = golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);
  const mailtoLink = `mailto:?bcc=${allEmails.join(",")}&subject=Saturday School – Course Handicaps: ${selCourseName}&body=${encodeURIComponent(buildEmailBody())}`;

  return (
    <div>
      <div className="card-title" style={{marginBottom:10}}>Course Handicap Sheet</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:14}}>Shows playing handicap for every member across all tee boxes at the selected course.</p>
      <div className="form-group">
        <label className="form-label">Golf Course</label>
        <select className="form-select" value={selCourseName} onChange={e=>setSelCourseName(e.target.value)}>
          {courseNames.map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {tees.length > 0 && (
        <>
          <div style={{overflowX:"auto"}}>
            <table className="hcp-table">
              <thead>
                <tr>
                  <th>Golfer</th>
                  {tees.map((t:any)=><th key={t.course_id}>{t.tee_box_name}<br/><span style={{fontWeight:400,fontSize:10}}>Sl {t.tee_slope} / Rt {t.tee_rating}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {members.map((g:any) => (
                  <tr key={g.golfer_id}>
                    <td>{g.first_name} {g.last_name}<br/><span style={{fontSize:11,color:"var(--text-muted)"}}>HCP {g.current_handicap_index.toFixed(1)}</span></td>
                    {tees.map((t:any) => {
                      const ph = calcPlayingHandicap(g.current_handicap_index, t.tee_slope, t.tee_rating, t.par);
                      return <td key={t.course_id} style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:16,color:"var(--green-700)"}}>{ph}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a href={mailtoLink} className="btn btn-outline btn-full" style={{marginTop:14,textDecoration:"none",display:"flex"}}>✉ Email Course Handicaps</a>
        </>
      )}
    </div>
  );
}

function EventCreator({ courses, events, setEvents, signups, setSignups, golfers, showSuccess }: any) {
  const [date, setDate] = useState("");
  const [courseName, setCourseName] = useState("");
  const [teeTimes, setTeeTimes] = useState("08:00\n08:10\n08:20\n08:30");

  const courseNames = uniqueCourseNames(courses);

  const handleCreate = () => {
    if (!date || !courseName) return;
    const newId = Math.max(...events.map((e:any)=>e.event_id), 0) + 1;
    const tts = teeTimes.split("\n").map(t=>t.trim()).filter(Boolean);
    const newEvent = { event_id: newId, date, course_name: courseName, tee_times: tts, status: "Upcoming" };
    setEvents((prev:any) => [...prev, newEvent]);
    const activeGs = golfers.filter((g:any)=>!g.is_guest&&g.status==="Active");
    setSignups((prev:any) => [...prev, ...activeGs.map((g:any, i:number) => ({
      signup_id: Date.now()+i, event_id: newId, golfer_id: g.golfer_id,
      attending: "Unconfirmed", assigned_tee_time: null, tee_box_course_id: null,
      playing_handicap: null, is_guest_entry: false, sponsor_golfer_id: null,
    }))]);
    showSuccess(`Event created: ${formatDate(date)}`);
    setDate(""); setCourseName(""); setTeeTimes("08:00\n08:10\n08:20\n08:30");
  };

  const activeEmails = golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);
  const mailtoLink = `mailto:?bcc=${activeEmails.join(",")}&subject=Saturday School – Upcoming Round&body=Hi all, join us for our next Saturday round. Please RSVP on the app!`;

  return (
    <div>
      <div className="card-title" style={{marginBottom:10}}>Create New Event</div>
      <div className="form-group">
        <label className="form-label">Date</label>
        <input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Golf Course</label>
        <select className="form-select" value={courseName} onChange={e=>setCourseName(e.target.value)}>
          <option value="">Select course…</option>
          {courseNames.map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Tee Times (one per line)</label>
        <textarea className="form-input" rows={5} value={teeTimes} onChange={e=>setTeeTimes(e.target.value)} style={{resize:"vertical"}} />
      </div>
      <button className="btn btn-primary btn-full" onClick={handleCreate}>Create Event</button>
      <hr className="divider" />
      <div className="card-title" style={{marginBottom:8}}>Invitation Email</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:10}}>Opens a pre-filled mailto: with all active members BCC'd.</p>
      <a href={mailtoLink} className="btn btn-outline btn-full" style={{textDecoration:"none",display:"flex"}}>✉ Send Invitation</a>
    </div>
  );
}

function PairingDashboard({ golfers, courses, events, setEvents, signups, setSignups, showSuccess }: any) {
  const [selEventId, setSelEventId] = useState(events.find((e:any)=>e.status!=="Completed")?.event_id || "");
  const [pairings, setPairings] = useState<any[]|null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const selEvent = events.find((e:any) => e.event_id === parseInt(selEventId));
  const eventSignups = selEvent ? signups.filter((s:any) => s.event_id === selEvent.event_id && s.attending === "Yes") : [];

  const runPairings = () => {
    const attendees = eventSignups.map((s:any) => ({ golfer_id: s.golfer_id, sponsor_golfer_id: s.sponsor_golfer_id }));
    const groups = runPairingEngine(attendees, selEvent.tee_times);
    setPairings(groups);
    setConfirmed(false);
  };

  const confirmPairings = () => {
    if (!pairings || !selEvent) return;
    const teeMap: Record<number,string> = {};
    pairings.forEach(g => g.players.forEach((gid:number) => { teeMap[gid] = g.teeTime; }));
    setSignups((prev:any) => prev.map((s:any) => {
      if (s.event_id !== selEvent.event_id || !teeMap[s.golfer_id]) return s;
      const g = golfers.find((x:any) => x.golfer_id === s.golfer_id);
      // Use existing tee box or default to first available
      const courseId = s.tee_box_course_id || courses.filter((c:any) => c.course_name === selEvent.course_name)[0]?.course_id;
      const tee = courses.find((c:any) => c.course_id === courseId);
      const ph = (g && tee) ? calcPlayingHandicap(g.current_handicap_index, tee.tee_slope, tee.tee_rating, tee.par) : null;
      return { ...s, assigned_tee_time: teeMap[s.golfer_id], playing_handicap: ph };
    }));
    setEvents((prev:any) => prev.map((e:any) => e.event_id === selEvent.event_id ? {...e, status:"Pairings Set"} : e));
    setConfirmed(true);
    showSuccess("Pairings confirmed");
  };

  const buildPairingBody = () => {
    if (!pairings || !selEvent) return "";
    let body = `Saturday School – Pairings\n${formatDate(selEvent.date)} @ ${selEvent.course_name}\n\n`;
    pairings.forEach((g:any, i:number) => {
      body += `Group ${i+1} – Tee: ${g.teeTime}\n`;
      g.players.forEach((gid:number) => {
        const golfer = golfers.find((x:any) => x.golfer_id === gid);
        const su = signups.find((s:any) => s.event_id === selEvent.event_id && s.golfer_id === gid);
        const tee = courses.find((c:any) => c.course_id === su?.tee_box_course_id);
        const ph = (golfer && tee) ? calcPlayingHandicap(golfer.current_handicap_index, tee.tee_slope, tee.tee_rating, tee.par) : "—";
        const isGuest = golfer?.is_guest ? " (Guest)" : "";
        body += `  • ${golfer?.first_name} ${golfer?.last_name}${isGuest} — Playing HCP: ${ph}\n`;
      });
      body += "\n";
    });
    return body;
  };

  const allEmails = golfers.filter((g:any)=>!g.is_guest&&g.status==="Active"&&g.email_address).map((g:any)=>g.email_address);

  return (
    <div>
      <div className="card-title" style={{marginBottom:10}}>Pairing Engine</div>
      <div className="form-group">
        <label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e=>{setSelEventId(e.target.value); setPairings(null); setConfirmed(false);}}>
          <option value="">Select event…</option>
          {events.filter((e:any)=>e.status!=="Completed").map((ev:any)=>(
            <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {ev.course_name}</option>
          ))}
        </select>
      </div>

      {selEvent && (
        <div className="card" style={{padding:"10px 14px",marginBottom:12}}>
          <div className="info-row"><span className="info-key">Confirmed players</span><span className="info-val" style={{color:"var(--green-700)",fontWeight:700}}>{eventSignups.length}</span></div>
          <div className="info-row"><span className="info-key">Tee times available</span><span className="info-val">{selEvent.tee_times.length}</span></div>
          <div className="info-row"><span className="info-key">Groups (auto)</span><span className="info-val">{eventSignups.length>0?Math.ceil(eventSignups.length/4):"—"}</span></div>
        </div>
      )}

      <button className="btn btn-gold btn-full" onClick={runPairings} disabled={!selEvent||eventSignups.length<2}>
        🎲 Generate Pairings
      </button>

      {pairings && (
        <div style={{marginTop:14}}>
          {pairings.map((group:any, i:number) => (
            <div key={i} className="pairing-card">
              <div className="pairing-header">
                <span className="pairing-time">⏱ {group.teeTime}</span>
                <span className="pairing-group">Group {i+1} · {group.players.length} players</span>
              </div>
              <div className="pairing-body">
                {group.players.map((gid:number) => {
                  const g = golfers.find((x:any) => x.golfer_id === gid);
                  const su = signups.find((s:any) => s.event_id === selEvent?.event_id && s.golfer_id === gid);
                  const tee = courses.find((c:any) => c.course_id === su?.tee_box_course_id);
                  const ph = (g && tee) ? calcPlayingHandicap(g.current_handicap_index, tee.tee_slope, tee.tee_rating, tee.par) : "—";
                  return (
                    <div key={gid} className="pairing-player">
                      <div>
                        <span>{g?.first_name} {g?.last_name}</span>
                        {g?.is_guest && <span className="guest-tag">guest</span>}
                        {su?.sponsor_golfer_id && <span style={{fontSize:11,color:"var(--text-muted)",marginLeft:4}}>w/ {golferName(golfers,su.sponsor_golfer_id).split(" ")[0]}</span>}
                      </div>
                      <span className="pairing-hcp">HCP {ph}{tee ? ` (${tee.tee_box_name})` : ""}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={confirmPairings} disabled={confirmed}>
              {confirmed?"✓ Confirmed":"Confirm Pairings"}
            </button>
            <a
              href={`mailto:?bcc=${allEmails.join(",")}&subject=Saturday School Pairings – ${formatDate(selEvent?.date)}&body=${encodeURIComponent(buildPairingBody())}`}
              className="btn btn-outline"
              style={{flex:1,textDecoration:"none"}}
            >✉ Email Groups</a>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANALYTICS TAB  (fix #6 – group by course_name not tee box)
// ============================================================
function AnalyticsTab({ golfers, courses, events, leaderboard }: any) {
  const [subTab, setSubTab] = useState("course");
  const [selGolfer, setSelGolfer] = useState("");

  // FIX #6 – averages by course name, not by course_id/tee box
  const courseNames = uniqueCourseNames(courses);
  const courseAvgs = courseNames.map(name => {
    const evIds = events.filter((e:any) => e.course_name === name).map((e:any) => e.event_id);
    const entries = leaderboard.filter((r:any) =>
      evIds.includes(r.event_id) && !golfers.find((g:any) => g.golfer_id === r.golfer_id)?.is_guest
    );
    const avg = entries.length ? entries.reduce((s:number,r:any)=>s+r.total_stableford_points,0)/entries.length : 0;
    return { name, avg, count: entries.length };
  });

  const scatterData = golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any) => {
    const rounds = [
      ...leaderboard.filter((r:any)=>r.golfer_id===g.golfer_id).map((r:any)=>r.total_stableford_points),
      ...(EXTRA_ROUNDS_BY_GOLFER[g.golfer_id]||[]),
    ];
    if (!rounds.length) return null;
    return { golfer: g, hcp: g.current_handicap_index, avg: rounds.reduce((a:number,b:number)=>a+b,0)/rounds.length, rounds: rounds.length };
  }).filter(Boolean);

  const selG = golfers.find((g:any) => g.golfer_id === parseInt(selGolfer));
  const golferRounds = selG ? [
    ...leaderboard.filter((r:any)=>r.golfer_id===selG.golfer_id).map((r:any)=>({pts:r.total_stableford_points,eid:r.event_id})),
    ...(EXTRA_ROUNDS_BY_GOLFER[selG.golfer_id]||[]).map((pts:number,i:number)=>({pts,eid:-(i+1)})),
  ].sort((a:any,b:any)=>a.eid-b.eid) : [];

  return (
    <div>
      <div className="section-title">Analytics</div>
      <div className="section-sub">2026 Season Performance</div>
      <div className="tab-sub">
        {[{id:"course",label:"By Course"},{id:"scatter",label:"HCP vs Pts"},{id:"golfer",label:"Golfer History"}].map(t=>(
          <button key={t.id} className={`tab-sub-btn${subTab===t.id?" active":""}`} onClick={()=>setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {subTab==="course" && <CourseChart courseAvgs={courseAvgs} />}
      {subTab==="scatter" && <ScatterChart scatterData={scatterData} />}
      {subTab==="golfer" && (
        <>
          <div className="form-group">
            <label className="form-label">Select Golfer</label>
            <select className="form-select" value={selGolfer} onChange={e=>setSelGolfer(e.target.value)}>
              <option value="">Choose golfer…</option>
              {golfers.filter((g:any)=>!g.is_guest&&g.status==="Active").map((g:any)=>(
                <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
              ))}
            </select>
          </div>
          {selG && golferRounds.length>0 && <GolferHistoryChart golfer={selG} rounds={golferRounds} />}
        </>
      )}
    </div>
  );
}

function CourseChart({ courseAvgs }: any) {
  useEffect(() => {
    const tryBuild = () => {
      if (!(window as any).Chart) return false;
      const ctx = document.getElementById("courseChart") as HTMLCanvasElement;
      if (!ctx) return false;
      const existing = (window as any).Chart.getChart("courseChart");
      if (existing) existing.destroy();
      new (window as any).Chart(ctx, {
        type: "bar",
        data: {
          labels: courseAvgs.map((c:any) => c.name),
          datasets: [{ label: "Avg Pts", data: courseAvgs.map((c:any) => parseFloat(c.avg.toFixed(1))), backgroundColor: ["#1a7340","#c47800","#a32020","#0f4526"], borderRadius: 6 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c:any) => ` ${c.parsed.y.toFixed(1)} pts avg` } } },
          scales: {
            y: { beginAtZero: false, min: 20, ticks: { color:"#6b5240",font:{family:"Barlow Condensed, sans-serif",size:13} }, grid: { color:"rgba(74,55,40,0.1)" } },
            x: { ticks: { color:"#6b5240",font:{family:"Barlow Condensed, sans-serif",size:12} }, grid: { display:false } },
          },
        },
      });
      return true;
    };
    if (!tryBuild()) {
      const id = setInterval(() => { if (tryBuild()) clearInterval(id); }, 300);
      return () => clearInterval(id);
    }
  }, [courseAvgs]);

  return (
    <div>
      <div className="card-title" style={{marginBottom:10}}>Stableford Averages by Course</div>
      {courseAvgs.map((c:any)=>(
        <div key={c.name} className="info-row">
          <span className="info-key">{c.name}</span>
          <span className="info-val">{c.count>0?`${c.avg.toFixed(1)} pts (${c.count} rounds)`:"No data"}</span>
        </div>
      ))}
      <div style={{position:"relative",width:"100%",height:200,marginTop:16}}>
        <canvas id="courseChart" role="img" aria-label="Bar chart of average stableford points by course">Avg stableford by course</canvas>
      </div>
    </div>
  );
}

function ScatterChart({ scatterData }: any) {
  useEffect(() => {
    const tryBuild = () => {
      if (!(window as any).Chart) return false;
      const ctx = document.getElementById("scatterChart") as HTMLCanvasElement;
      if (!ctx) return false;
      const existing = (window as any).Chart.getChart("scatterChart");
      if (existing) existing.destroy();
      new (window as any).Chart(ctx, {
        type: "scatter",
        data: { datasets: [{ label:"Golfers", data: scatterData.map((d:any)=>({x:d.hcp,y:parseFloat(d.avg.toFixed(1)),name:`${d.golfer.first_name} ${d.golfer.last_name}`})), backgroundColor:"#1a7340", pointRadius:7, pointHoverRadius:9 }] },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins: { legend:{display:false}, tooltip:{ callbacks:{ label:(c:any)=>`${c.raw.name}: HCP ${c.raw.x} → ${c.raw.y.toFixed(1)} pts avg` } } },
          scales: {
            x: { title:{display:true,text:"Handicap Index",color:"#6b5240",font:{family:"Barlow Condensed, sans-serif",size:13}}, ticks:{color:"#6b5240"}, grid:{color:"rgba(74,55,40,0.1)"} },
            y: { title:{display:true,text:"Avg Stableford Pts",color:"#6b5240",font:{family:"Barlow Condensed, sans-serif",size:13}}, ticks:{color:"#6b5240"}, grid:{color:"rgba(74,55,40,0.1)"} },
          },
        },
      });
      return true;
    };
    if (!tryBuild()) {
      const id = setInterval(() => { if (tryBuild()) clearInterval(id); }, 300);
      return () => clearInterval(id);
    }
  }, [scatterData]);

  return (
    <div>
      <div className="card-title" style={{marginBottom:4}}>Handicap Index vs Avg Performance</div>
      <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>Higher scores relative to HCP = outperforming. Tap a dot for golfer details.</p>
      <div style={{position:"relative",width:"100%",height:260}}>
        <canvas id="scatterChart" role="img" aria-label="Scatter plot handicap vs avg points">Handicap vs stableford</canvas>
      </div>
    </div>
  );
}

function GolferHistoryChart({ golfer, rounds }: any) {
  useEffect(() => {
    const tryBuild = () => {
      if (!(window as any).Chart) return false;
      const ctx = document.getElementById("histChart") as HTMLCanvasElement;
      if (!ctx) return false;
      const existing = (window as any).Chart.getChart("histChart");
      if (existing) existing.destroy();
      const data = rounds.map((r:any) => r.pts);
      const avg = data.reduce((a:number,b:number)=>a+b,0)/data.length;
      new (window as any).Chart(ctx, {
        type:"line",
        data: {
          labels: rounds.map((_:any,i:number)=>`R${i+1}`),
          datasets: [
            { label:"Points", data, borderColor:"#1a7340", backgroundColor:"rgba(26,115,64,0.08)", pointBackgroundColor:"#1a7340", pointRadius:4, fill:true, tension:0.3 },
            { label:"Avg", data:Array(rounds.length).fill(parseFloat(avg.toFixed(1))), borderColor:"#c47800", borderDash:[5,4], pointRadius:0, fill:false },
          ],
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false}},
          scales: {
            x:{ticks:{color:"#6b5240",font:{size:11},maxTicksLimit:10},grid:{display:false}},
            y:{min:15,ticks:{color:"#6b5240"},grid:{color:"rgba(74,55,40,0.1)"}},
          },
        },
      });
      return true;
    };
    if (!tryBuild()) {
      const id = setInterval(() => { if (tryBuild()) clearInterval(id); }, 300);
      return () => clearInterval(id);
    }
  }, [golfer, rounds]);

  const avg = (rounds.reduce((s:number,r:any)=>s+r.pts,0)/rounds.length).toFixed(1);
  const best = Math.max(...rounds.map((r:any)=>r.pts));
  const worst = Math.min(...rounds.map((r:any)=>r.pts));

  return (
    <div>
      <div className="stat-grid" style={{marginBottom:12}}>
        <div className="stat-card"><div className="stat-value">{avg}</div><div className="stat-label">Season Avg</div></div>
        <div className="stat-card"><div className="stat-value">{rounds.length}</div><div className="stat-label">Rounds</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--gold-600)"}}>{best}</div><div className="stat-label">Best</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:"var(--red-600)"}}>{worst}</div><div className="stat-label">Worst</div></div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <div className="card-title">{golfer.first_name} {golfer.last_name}</div>
        <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--text-muted)"}}>
          <span style={{width:12,height:3,background:"#1a7340",display:"inline-block",borderRadius:2}}></span>Rounds
          <span style={{width:12,height:3,background:"#c47800",display:"inline-block",borderRadius:2,marginLeft:4}}></span>Avg
        </span>
      </div>
      <div style={{position:"relative",width:"100%",height:200}}>
        <canvas id="histChart" role="img" aria-label={`Line chart for ${golfer.first_name} ${golfer.last_name}`}>Round history</canvas>
      </div>
    </div>
  );
}