import { useState, useEffect, useCallback } from "react";

// ============================================================
// DESIGN TOKENS – SA-inspired palette (Springbok & Protea)
// ============================================================
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Barlow+Condensed:wght@400;500;600;700&family=Barlow:wght@300;400;500;600&display=swap');

  :root {
    --green-900: #0a2e1a;
    --green-800: #0f4526;
    --green-700: #155c32;
    --green-600: #1a7340;
    --green-500: #228b50;
    --green-400: #2db368;
    --green-300: #5cc98a;
    --green-100: #d4f2e3;
    --green-50:  #edf9f2;

    --gold-900: #3d2400;
    --gold-800: #6b3d00;
    --gold-700: #9a5a00;
    --gold-600: #c47800;
    --gold-500: #e09400;
    --gold-400: #f5b000;
    --gold-300: #ffc947;
    --gold-100: #fff2cc;
    --gold-50:  #fffaf0;

    --red-800:  #7a1515;
    --red-600:  #c02020;
    --red-400:  #e84040;
    --red-100:  #fde8e8;

    --earth-900: #1c1410;
    --earth-800: #2e221a;
    --earth-700: #4a3728;
    --earth-600: #6b5240;
    --earth-400: #9c7c65;
    --earth-200: #d4c4b8;
    --earth-100: #ede6e0;
    --earth-50:  #f7f4f1;

    --bg: #f4f1ec;
    --surface: #ffffff;
    --surface2: #f9f7f4;
    --border: rgba(74,55,40,0.15);
    --border-md: rgba(74,55,40,0.25);
    --text-primary: #1c1410;
    --text-secondary: #6b5240;
    --text-muted: #9c7c65;

    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
    --radius-xl: 24px;

    --shadow-sm: 0 1px 3px rgba(28,20,16,0.08);
    --shadow-md: 0 4px 16px rgba(28,20,16,0.10);
    --shadow-lg: 0 8px 32px rgba(28,20,16,0.12);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Barlow', sans-serif;
    background: var(--bg);
    color: var(--text-primary);
    font-size: 16px;
    line-height: 1.5;
    min-height: 100vh;
  }

  .app-shell {
    max-width: 500px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  /* Header */
  .app-header {
    background: var(--green-900);
    padding: 0;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3);
  }
  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 8px;
  }
  .brand {
    display: flex;
    flex-direction: column;
  }
  .brand-name {
    font-family: 'Playfair Display', serif;
    font-size: 20px;
    font-weight: 700;
    color: var(--gold-400);
    letter-spacing: 0.02em;
    line-height: 1.1;
  }
  .brand-tagline {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 11px;
    color: var(--green-300);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .header-badge {
    background: var(--gold-500);
    color: var(--green-900);
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 4px 10px;
    border-radius: 20px;
  }

  /* Nav tabs */
  .nav-tabs {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .nav-tabs::-webkit-scrollbar { display: none; }
  .nav-tab {
    flex-shrink: 0;
    padding: 10px 14px;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.5);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s;
    white-space: nowrap;
  }
  .nav-tab.active {
    color: var(--gold-300);
    border-bottom-color: var(--gold-400);
  }
  .nav-tab:hover:not(.active) { color: rgba(255,255,255,0.75); }

  /* Main content */
  .main-content { flex: 1; padding: 16px; }

  /* Section headers */
  .section-title {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 600;
    color: var(--green-800);
    margin-bottom: 4px;
  }
  .section-sub {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 16px;
    font-weight: 400;
  }

  /* Cards */
  .card {
    background: var(--surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    padding: 16px;
    margin-bottom: 12px;
    box-shadow: var(--shadow-sm);
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .card-title {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--green-700);
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border-radius: var(--radius-md);
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    border: none;
    transition: all 0.15s;
  }
  .btn-primary {
    background: var(--green-700);
    color: #fff;
  }
  .btn-primary:hover { background: var(--green-600); transform: translateY(-1px); }
  .btn-primary:active { transform: translateY(0); }
  .btn-gold {
    background: var(--gold-500);
    color: var(--green-900);
  }
  .btn-gold:hover { background: var(--gold-400); }
  .btn-outline {
    background: transparent;
    color: var(--green-700);
    border: 1.5px solid var(--green-600);
  }
  .btn-outline:hover { background: var(--green-50); }
  .btn-danger {
    background: var(--red-600);
    color: white;
  }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .btn-full { width: 100%; justify-content: center; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }

  /* Form inputs */
  .form-group { margin-bottom: 14px; }
  .form-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin-bottom: 5px;
  }
  .form-input, .form-select {
    width: 100%;
    padding: 10px 13px;
    border: 1.5px solid var(--border-md);
    border-radius: var(--radius-md);
    font-family: 'Barlow', sans-serif;
    font-size: 15px;
    color: var(--text-primary);
    background: var(--surface);
    transition: border-color 0.15s;
    outline: none;
  }
  .form-input:focus, .form-select:focus {
    border-color: var(--green-500);
    box-shadow: 0 0 0 3px rgba(34,139,80,0.12);
  }

  /* Status pills */
  .pill {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 20px;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .pill-green { background: var(--green-100); color: var(--green-700); }
  .pill-gold { background: var(--gold-100); color: var(--gold-700); }
  .pill-red { background: var(--red-100); color: var(--red-600); }
  .pill-earth { background: var(--earth-100); color: var(--earth-600); }
  .pill-gray { background: var(--earth-100); color: var(--text-muted); }

  /* Leaderboard */
  .leaderboard-row {
    display: flex;
    align-items: center;
    padding: 11px 14px;
    border-radius: var(--radius-md);
    margin-bottom: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    transition: background 0.15s;
  }
  .leaderboard-row:hover { background: var(--green-50); }
  .lb-rank {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: var(--earth-400);
    min-width: 38px;
  }
  .lb-rank.top1 { color: var(--gold-500); }
  .lb-rank.top2 { color: var(--earth-400); }
  .lb-rank.top3 { color: var(--earth-600); }
  .lb-name {
    flex: 1;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-primary);
  }
  .lb-hcp {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 400;
    margin-top: 1px;
  }
  .lb-score {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 26px;
    font-weight: 700;
    color: var(--green-700);
    min-width: 50px;
    text-align: right;
  }
  .lb-pts-label {
    font-size: 11px;
    color: var(--text-muted);
    text-align: right;
  }

  /* Score grid */
  .score-grid {
    overflow-x: auto;
  }
  .score-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .score-table th {
    background: var(--green-900);
    color: var(--gold-300);
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    padding: 7px 8px;
    text-align: center;
    white-space: nowrap;
  }
  .score-table td {
    padding: 8px 6px;
    text-align: center;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .score-table tr:nth-child(even) td { background: var(--surface2); }
  .score-input-cell input {
    width: 38px;
    padding: 4px 2px;
    text-align: center;
    border: 1.5px solid var(--border-md);
    border-radius: 5px;
    font-size: 14px;
    font-family: 'Barlow', sans-serif;
  }
  .score-input-cell input:focus {
    border-color: var(--green-500);
    outline: none;
    box-shadow: 0 0 0 2px rgba(34,139,80,0.15);
  }
  .pts-eagle { background: var(--gold-100); color: var(--gold-800); font-weight: 700; }
  .pts-birdie { background: var(--green-100); color: var(--green-700); font-weight: 700; }
  .pts-par { background: #f0f0f0; color: #555; }
  .pts-bogey { background: #fff3e0; color: #b35c00; }
  .pts-zero { background: var(--red-100); color: var(--red-600); }

  /* Stat cards */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-bottom: 14px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 14px 12px;
    text-align: center;
  }
  .stat-value {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 32px;
    font-weight: 700;
    color: var(--green-700);
    line-height: 1;
    margin-bottom: 4px;
  }
  .stat-label {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
    letter-spacing: 0.03em;
  }

  /* Toggle */
  .toggle-group {
    display: flex;
    background: var(--earth-100);
    border-radius: var(--radius-md);
    padding: 3px;
    margin-bottom: 16px;
  }
  .toggle-btn {
    flex: 1;
    padding: 9px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .toggle-btn.active {
    background: var(--green-800);
    color: white;
    box-shadow: var(--shadow-sm);
  }

  /* Pairing card */
  .pairing-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    margin-bottom: 8px;
    overflow: hidden;
  }
  .pairing-header {
    background: var(--green-800);
    padding: 8px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pairing-time {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: var(--gold-300);
    letter-spacing: 0.06em;
  }
  .pairing-group {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 12px;
    color: var(--green-300);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .pairing-body { padding: 10px 14px; }
  .pairing-player {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
    font-size: 15px;
  }
  .pairing-player:last-child { border-bottom: none; }
  .pairing-hcp {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 13px;
    color: var(--green-600);
    font-weight: 600;
  }

  /* RSVP row */
  .rsvp-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .rsvp-row:last-child { border-bottom: none; }
  .rsvp-name {
    font-size: 15px;
    font-weight: 500;
  }
  .rsvp-actions { display: flex; gap: 6px; }
  .rsvp-btn {
    padding: 5px 12px;
    border-radius: 20px;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    border: 1.5px solid;
    cursor: pointer;
    transition: all 0.15s;
    background: transparent;
  }
  .rsvp-btn.yes { border-color: var(--green-500); color: var(--green-700); }
  .rsvp-btn.yes.active { background: var(--green-700); color: white; border-color: var(--green-700); }
  .rsvp-btn.no { border-color: var(--red-400); color: var(--red-600); }
  .rsvp-btn.no.active { background: var(--red-600); color: white; border-color: var(--red-600); }

  /* Chart section */
  .chart-wrap { position: relative; width: 100%; height: 220px; margin-bottom: 8px; }

  /* Divider */
  .divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 16px 0;
  }

  /* Finance table */
  .fin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .fin-table th {
    background: var(--green-50);
    color: var(--green-800);
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 2px solid var(--green-200, #5cc98a40);
  }
  .fin-table td {
    padding: 9px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .fin-table tr:last-child td { border-bottom: none; }
  .money { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; color: var(--green-700); }

  /* Modal overlay */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(28,20,16,0.6);
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .modal-sheet {
    background: var(--surface);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    width: 100%;
    max-width: 500px;
    max-height: 85vh;
    overflow-y: auto;
    padding: 20px 16px 32px;
    animation: slideUp 0.3s ease;
  }
  @keyframes slideUp {
    from { transform: translateY(40px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .modal-handle {
    width: 36px;
    height: 4px;
    background: var(--border-md);
    border-radius: 2px;
    margin: 0 auto 16px;
  }
  .modal-title {
    font-family: 'Playfair Display', serif;
    font-size: 20px;
    font-weight: 600;
    color: var(--green-800);
    margin-bottom: 4px;
  }

  /* Trophy / podium */
  .podium-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }
  .podium-card {
    border-radius: var(--radius-md);
    padding: 12px 8px;
    text-align: center;
    border: 1px solid var(--border);
  }
  .podium-card.p1 { background: linear-gradient(145deg, var(--gold-50), var(--gold-100)); border-color: var(--gold-300); }
  .podium-card.p2 { background: var(--surface); }
  .podium-card.p3 { background: var(--earth-50); }
  .podium-pos {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: var(--gold-500);
    line-height: 1;
  }
  .podium-card.p2 .podium-pos { color: var(--earth-400); }
  .podium-card.p3 .podium-pos { color: var(--earth-600); }
  .podium-pname {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-top: 4px;
    line-height: 1.2;
  }
  .podium-pscore {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: var(--green-700);
    margin-top: 2px;
  }

  .success-banner {
    background: var(--green-100);
    border: 1px solid var(--green-300);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    color: var(--green-800);
    font-size: 14px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tab-sub {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab-sub-btn {
    flex-shrink: 0;
    padding: 6px 14px;
    border-radius: 20px;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    border: 1.5px solid var(--border-md);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-sub-btn.active {
    background: var(--green-800);
    border-color: var(--green-800);
    color: white;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
  }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-text { font-size: 15px; margin-bottom: 4px; color: var(--text-secondary); }
  .empty-sub { font-size: 13px; }

  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .info-row:last-child { border-bottom: none; }
  .info-key { color: var(--text-muted); font-weight: 400; }
  .info-val { font-weight: 500; color: var(--text-primary); }

  .charity-hero {
    background: var(--green-900);
    border-radius: var(--radius-lg);
    padding: 24px 20px;
    text-align: center;
    margin-bottom: 12px;
  }
  .charity-amount {
    font-family: 'Playfair Display', serif;
    font-size: 48px;
    font-weight: 700;
    color: var(--gold-400);
    line-height: 1;
  }
  .charity-label {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--green-300);
    margin-top: 6px;
  }
`;

// ============================================================
// SEED DATA
// ============================================================
const INITIAL_GOLFERS = [
  { golfer_id: 1, first_name: "Pieter", last_name: "van der Berg", email_address: "pieter@example.com", current_handicap_index: 12.4, is_guest: false, status: "Active" },
  { golfer_id: 2, first_name: "Brendan", last_name: "Joubert", email_address: "brendan@example.com", current_handicap_index: 8.2, is_guest: false, status: "Active" },
  { golfer_id: 3, first_name: "Thabo", last_name: "Nkosi", email_address: "thabo@example.com", current_handicap_index: 18.6, is_guest: false, status: "Active" },
  { golfer_id: 4, first_name: "Liam", last_name: "Botha", email_address: "liam@example.com", current_handicap_index: 5.1, is_guest: false, status: "Active" },
  { golfer_id: 5, first_name: "Riaan", last_name: "Pretorius", email_address: "riaan@example.com", current_handicap_index: 21.0, is_guest: false, status: "Active" },
  { golfer_id: 6, first_name: "Marco", last_name: "De Villiers", email_address: "marco@example.com", current_handicap_index: 14.8, is_guest: false, status: "Active" },
  { golfer_id: 7, first_name: "Shane", last_name: "Mitchell", email_address: "shane@example.com", current_handicap_index: 3.7, is_guest: false, status: "Active" },
  { golfer_id: 8, first_name: "Deon", last_name: "Steyn", email_address: "deon@example.com", current_handicap_index: 16.2, is_guest: false, status: "Active" },
  { golfer_id: 9, first_name: "Kyle", last_name: "Adams", email_address: "kyle@example.com", current_handicap_index: 9.9, is_guest: false, status: "Active" },
  { golfer_id: 10, first_name: "Francois", last_name: "Esterhuizen", email_address: "francois@example.com", current_handicap_index: 11.5, is_guest: false, status: "Active" },
  { golfer_id: 11, first_name: "Morne", last_name: "Kotze", email_address: "morne@example.com", current_handicap_index: 7.3, is_guest: false, status: "Active" },
  { golfer_id: 12, first_name: "André", last_name: "Potgieter", email_address: "andre@example.com", current_handicap_index: 19.1, is_guest: false, status: "Active" },
  { golfer_id: 99, first_name: "Guest", last_name: "Player", email_address: "", current_handicap_index: 18.0, is_guest: true, status: "Active" },
];

const INITIAL_COURSES = [
  {
    course_id: 1,
    course_name: "Randpark Golf Club",
    tee_box_name: "Blue",
    tee_slope: 126,
    tee_rating: 72.3,
    hole_pars: [4,4,3,5,4,4,3,5,4,4,3,5,4,4,3,5,4,4],
    hole_stroke_indices: [5,13,17,3,11,7,15,1,9,6,16,2,10,8,18,4,14,12],
  },
  {
    course_id: 2,
    course_name: "Houghton Golf Club",
    tee_box_name: "White",
    tee_slope: 119,
    tee_rating: 70.1,
    hole_pars: [4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4,4],
    hole_stroke_indices: [7,17,3,11,5,15,1,9,13,8,16,2,12,6,18,4,14,10],
  },
  {
    course_id: 3,
    course_name: "Royal Johannesburg East",
    tee_box_name: "Yellow",
    tee_slope: 133,
    tee_rating: 73.8,
    hole_pars: [5,4,3,4,4,5,4,3,4,4,4,3,5,4,4,3,5,4],
    hole_stroke_indices: [3,11,17,7,13,1,9,15,5,10,16,18,2,12,6,14,4,8],
  },
];

const INITIAL_EVENTS = [
  {
    event_id: 1,
    date: "2025-05-10",
    course_id: 1,
    tee_times: ["08:00","08:10","08:20","08:30"],
    status: "Completed",
  },
  {
    event_id: 2,
    date: "2025-05-17",
    course_id: 2,
    tee_times: ["08:00","08:10","08:20"],
    status: "Pairings Set",
  },
  {
    event_id: 3,
    date: "2025-05-24",
    course_id: 3,
    tee_times: ["08:00","08:10","08:20"],
    status: "Upcoming",
  },
];

const INITIAL_SIGNUPS = [
  // Event 1 - completed
  { signup_id: 1, event_id: 1, golfer_id: 1, attending: "Yes", assigned_tee_time: "08:00", playing_handicap: 13 },
  { signup_id: 2, event_id: 1, golfer_id: 2, attending: "Yes", assigned_tee_time: "08:00", playing_handicap: 8 },
  { signup_id: 3, event_id: 1, golfer_id: 3, attending: "Yes", assigned_tee_time: "08:00", playing_handicap: 19 },
  { signup_id: 4, event_id: 1, golfer_id: 4, attending: "Yes", assigned_tee_time: "08:00", playing_handicap: 5 },
  { signup_id: 5, event_id: 1, golfer_id: 5, attending: "Yes", assigned_tee_time: "08:10", playing_handicap: 21 },
  { signup_id: 6, event_id: 1, golfer_id: 6, attending: "Yes", assigned_tee_time: "08:10", playing_handicap: 15 },
  { signup_id: 7, event_id: 1, golfer_id: 7, attending: "Yes", assigned_tee_time: "08:10", playing_handicap: 4 },
  { signup_id: 8, event_id: 1, golfer_id: 8, attending: "Yes", assigned_tee_time: "08:10", playing_handicap: 16 },
  { signup_id: 9, event_id: 1, golfer_id: 9, attending: "Yes", assigned_tee_time: "08:20", playing_handicap: 10 },
  { signup_id: 10, event_id: 1, golfer_id: 10, attending: "Yes", assigned_tee_time: "08:20", playing_handicap: 12 },
  { signup_id: 11, event_id: 1, golfer_id: 11, attending: "Yes", assigned_tee_time: "08:20", playing_handicap: 7 },
  { signup_id: 12, event_id: 1, golfer_id: 12, attending: "Yes", assigned_tee_time: "08:30", playing_handicap: 19 },
  // Event 2 - pairings set
  { signup_id: 13, event_id: 2, golfer_id: 1, attending: "Yes", assigned_tee_time: "08:00", playing_handicap: 12 },
  { signup_id: 14, event_id: 2, golfer_id: 2, attending: "Yes", assigned_tee_time: "08:00", playing_handicap: 7 },
  { signup_id: 15, event_id: 2, golfer_id: 3, attending: "Yes", assigned_tee_time: "08:00", playing_handicap: 18 },
  { signup_id: 16, event_id: 2, golfer_id: 4, attending: "Yes", assigned_tee_time: "08:00", playing_handicap: 4 },
  { signup_id: 17, event_id: 2, golfer_id: 5, attending: "No", assigned_tee_time: null, playing_handicap: null },
  { signup_id: 18, event_id: 2, golfer_id: 6, attending: "Yes", assigned_tee_time: "08:10", playing_handicap: 14 },
  { signup_id: 19, event_id: 2, golfer_id: 7, attending: "Yes", assigned_tee_time: "08:10", playing_handicap: 3 },
  { signup_id: 20, event_id: 2, golfer_id: 8, attending: "Yes", assigned_tee_time: "08:10", playing_handicap: 15 },
  { signup_id: 21, event_id: 2, golfer_id: 9, attending: "Yes", assigned_tee_time: "08:10", playing_handicap: 9 },
  { signup_id: 22, event_id: 2, golfer_id: 10, attending: "Yes", assigned_tee_time: "08:20", playing_handicap: 11 },
  { signup_id: 23, event_id: 2, golfer_id: 11, attending: "Yes", assigned_tee_time: "08:20", playing_handicap: 6 },
  { signup_id: 24, event_id: 2, golfer_id: 12, attending: "Yes", assigned_tee_time: "08:20", playing_handicap: 18 },
  // Event 3 - upcoming
  { signup_id: 25, event_id: 3, golfer_id: 1, attending: "Unconfirmed", assigned_tee_time: null, playing_handicap: null },
  { signup_id: 26, event_id: 3, golfer_id: 2, attending: "Unconfirmed", assigned_tee_time: null, playing_handicap: null },
  { signup_id: 27, event_id: 3, golfer_id: 3, attending: "Unconfirmed", assigned_tee_time: null, playing_handicap: null },
  { signup_id: 28, event_id: 3, golfer_id: 4, attending: "Unconfirmed", assigned_tee_time: null, playing_handicap: null },
  { signup_id: 29, event_id: 3, golfer_id: 5, attending: "Unconfirmed", assigned_tee_time: null, playing_handicap: null },
  { signup_id: 30, event_id: 3, golfer_id: 6, attending: "Unconfirmed", assigned_tee_time: null, playing_handicap: null },
  { signup_id: 31, event_id: 3, golfer_id: 7, attending: "Unconfirmed", assigned_tee_time: null, playing_handicap: null },
  { signup_id: 32, event_id: 3, golfer_id: 8, attending: "Unconfirmed", assigned_tee_time: null, playing_handicap: null },
];

const INITIAL_LEADERBOARD = [
  // Event 1 results
  { summary_id: 1, event_id: 1, golfer_id: 4, entry_type: "Hole-by-Hole", total_stableford_points: 39, buy_in_paid: true, skins_paid: true, charity_paid: true, weekly_payout_won: 300.00, skins_payout_won: 0 },
  { summary_id: 2, event_id: 1, golfer_id: 7, entry_type: "Hole-by-Hole", total_stableford_points: 35, buy_in_paid: true, skins_paid: true, charity_paid: true, weekly_payout_won: 100.00, skins_payout_won: 40.00 },
  { summary_id: 3, event_id: 1, golfer_id: 2, entry_type: "Hole-by-Hole", total_stableford_points: 34, buy_in_paid: true, skins_paid: true, charity_paid: true, weekly_payout_won: 0, skins_payout_won: 40.00 },
  { summary_id: 4, event_id: 1, golfer_id: 11, entry_type: "Hole-by-Hole", total_stableford_points: 32, buy_in_paid: true, skins_paid: true, charity_paid: true, weekly_payout_won: 0, skins_payout_won: 20.00 },
  { summary_id: 5, event_id: 1, golfer_id: 9, entry_type: "Total Only", total_stableford_points: 31, buy_in_paid: true, skins_paid: false, charity_paid: true, weekly_payout_won: 0, skins_payout_won: 0 },
  { summary_id: 6, event_id: 1, golfer_id: 1, entry_type: "Total Only", total_stableford_points: 30, buy_in_paid: true, skins_paid: true, charity_paid: true, weekly_payout_won: 0, skins_payout_won: 0 },
  { summary_id: 7, event_id: 1, golfer_id: 10, entry_type: "Total Only", total_stableford_points: 29, buy_in_paid: true, skins_paid: false, charity_paid: true, weekly_payout_won: 0, skins_payout_won: 0 },
  { summary_id: 8, event_id: 1, golfer_id: 6, entry_type: "Total Only", total_stableford_points: 28, buy_in_paid: true, skins_paid: true, charity_paid: true, weekly_payout_won: 0, skins_payout_won: 0 },
  { summary_id: 9, event_id: 1, golfer_id: 3, entry_type: "Total Only", total_stableford_points: 27, buy_in_paid: true, skins_paid: false, charity_paid: true, weekly_payout_won: 0, skins_payout_won: 0 },
  { summary_id: 10, event_id: 1, golfer_id: 8, entry_type: "Total Only", total_stableford_points: 26, buy_in_paid: true, skins_paid: true, charity_paid: true, weekly_payout_won: 0, skins_payout_won: 0 },
  { summary_id: 11, event_id: 1, golfer_id: 5, entry_type: "Total Only", total_stableford_points: 24, buy_in_paid: true, skins_paid: false, charity_paid: false, weekly_payout_won: 0, skins_payout_won: 0 },
  { summary_id: 12, event_id: 1, golfer_id: 12, entry_type: "Total Only", total_stableford_points: 22, buy_in_paid: true, skins_paid: false, charity_paid: true, weekly_payout_won: 0, skins_payout_won: 0 },
];

const INITIAL_HOLE_SCORES = [];

// Dummy historical rounds for analytics (extra events rounds)
const EXTRA_ROUNDS_BY_GOLFER = {
  1: [31,29,28,33,30,27,32,34,29,28,30,31,27,26],
  2: [35,36,33,34,31,37,35,32,36,34,33,35,36,37],
  3: [27,25,28,26,29,27,24,28,26,25,27,26,28,29],
  4: [38,37,40,36,39,38,37,40,38,36,39,37,38,40],
  5: [24,23,26,25,22,24,25,23,26,24,25,23,24,22],
  6: [29,28,30,27,31,29,28,30,29,27,28,30,31,29],
  7: [36,35,37,38,34,36,35,38,36,34,37,35,36,38],
  8: [26,25,28,27,24,26,25,28,26,24,27,25,26,28],
  9: [31,30,32,29,33,31,30,32,31,29,30,32,33,31],
  10: [29,28,31,30,27,29,28,31,29,27,30,28,29,31],
  11: [34,33,35,36,32,34,33,35,34,32,35,33,34,36],
  12: [23,22,25,24,21,23,22,25,23,21,24,22,23,25],
};

// ============================================================
// BUSINESS LOGIC ENGINES
// ============================================================
function calcPlayingHandicap(hcpIndex, slope, rating, par) {
  return Math.round(hcpIndex * (slope / 113) + (rating - par));
}

function calcStablefordPoints(netScore, par) {
  const diff = netScore - par;
  if (diff <= -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

function calcHoleNetScore(grossScore, playingHandicap, strokeIndex) {
  const extraStrokes = Math.floor(playingHandicap / 18);
  const remainder = playingHandicap % 18;
  const strokes = extraStrokes + (strokeIndex <= remainder ? 1 : 0);
  return grossScore - strokes;
}

function calcHoleScores(grossScores, playingHandicap, course) {
  return grossScores.map((gross, i) => {
    if (!gross) return { gross: null, net: null, points: null };
    const net = calcHoleNetScore(gross, playingHandicap, course.hole_stroke_indices[i]);
    const pts = calcStablefordPoints(net, course.hole_pars[i]);
    return { gross, net, points: pts };
  });
}

function runPairingEngine(golferIds, teeTimes) {
  const N = golferIds.length;
  const G = Math.ceil(N / 4);
  const base = Math.floor(N / G);
  const R = N % G;
  const shuffled = [...golferIds].sort(() => Math.random() - 0.5);
  const groups = [];
  let idx = 0;
  for (let g = 0; g < G; g++) {
    const size = g < R ? base + 1 : base;
    groups.push(shuffled.slice(idx, idx + size));
    idx += size;
  }
  return groups.map((group, i) => ({ teeTime: teeTimes[i] || teeTimes[teeTimes.length - 1], players: group }));
}

// ============================================================
// UTILITIES
// ============================================================
function golferName(golfers, id) {
  const g = golfers.find(x => x.golfer_id === id);
  return g ? `${g.first_name} ${g.last_name}` : "Unknown";
}
function courseName(courses, id) {
  const c = courses.find(x => x.course_id === id);
  return c ? `${c.course_name} (${c.tee_box_name})` : "Unknown";
}
function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function coursePar(course) {
  return course ? course.hole_pars.reduce((a, b) => a + b, 0) : 72;
}

// ============================================================
// APP COMPONENT
// ============================================================
export default function App() {
  // State
  const [golfers, setGolfers] = useState(INITIAL_GOLFERS);
  const [courses] = useState(INITIAL_COURSES);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [signups, setSignups] = useState(INITIAL_SIGNUPS);
  const [leaderboard, setLeaderboard] = useState(INITIAL_LEADERBOARD);
  const [holeScores, setHoleScores] = useState(INITIAL_HOLE_SCORES);

  const [activeTab, setActiveTab] = useState("leaderboard");
  const [adminMode, setAdminMode] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Modals
  const [modal, setModal] = useState(null);

  const showSuccess = useCallback((msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  }, []);

  const tabs = adminMode
    ? [
        { id: "leaderboard", label: "Leaderboard" },
        { id: "rsvp", label: "RSVP" },
        { id: "score", label: "Score Entry" },
        { id: "admin", label: "⚙ Admin" },
        { id: "analytics", label: "Analytics" },
      ]
    : [
        { id: "leaderboard", label: "Leaderboard" },
        { id: "rsvp", label: "RSVP" },
        { id: "score", label: "Score Entry" },
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
              className={`header-badge`}
              style={{ cursor: "pointer", background: adminMode ? "#c02020" : undefined }}
              onClick={() => setAdminMode(v => !v)}
            >
              {adminMode ? "EXIT ADMIN" : "ADMIN"}
            </button>
          </div>
          <nav className="nav-tabs">
            {tabs.map(t => (
              <button
                key={t.id}
                className={`nav-tab${activeTab === t.id ? " active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="main-content">
          {successMsg && (
            <div className="success-banner">
              <span>✓</span> {successMsg}
            </div>
          )}

          {activeTab === "leaderboard" && (
            <LeaderboardTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} signups={signups} />
          )}
          {activeTab === "rsvp" && (
            <RSVPTab golfers={golfers} events={events} signups={signups} setSignups={setSignups} showSuccess={showSuccess} />
          )}
          {activeTab === "score" && (
            <ScoreEntryTab golfers={golfers} courses={courses} events={events} signups={signups} leaderboard={leaderboard} setLeaderboard={setLeaderboard} holeScores={holeScores} setHoleScores={setHoleScores} setEvents={setEvents} showSuccess={showSuccess} />
          )}
          {activeTab === "admin" && adminMode && (
            <AdminTab golfers={golfers} setGolfers={setGolfers} courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} leaderboard={leaderboard} setLeaderboard={setLeaderboard} showSuccess={showSuccess} />
          )}
          {activeTab === "analytics" && (
            <AnalyticsTab golfers={golfers} courses={courses} events={events} leaderboard={leaderboard} />
          )}
        </main>
      </div>
    </>
  );
}

// ============================================================
// LEADERBOARD TAB
// ============================================================
function LeaderboardTab({ golfers, courses, events, leaderboard, signups }) {
  const [subTab, setSubTab] = useState("current");
  const [selectedEvent, setSelectedEvent] = useState(null);

  const completedEvents = events.filter(e => e.status === "Completed");
  const latestCompleted = completedEvents.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const displayEvent = selectedEvent || latestCompleted;

  // Current event leaderboard
  const eventEntries = displayEvent
    ? leaderboard
        .filter(e => e.event_id === displayEvent.event_id)
        .sort((a, b) => b.total_stableford_points - a.total_stableford_points)
    : [];

  // Season average (min 15 rounds, no guests)
  const seasonAvg = (() => {
    const byGolfer = {};
    leaderboard.forEach(r => {
      const g = golfers.find(x => x.golfer_id === r.golfer_id);
      if (!g || g.is_guest) return;
      if (!byGolfer[r.golfer_id]) byGolfer[r.golfer_id] = [];
      byGolfer[r.golfer_id].push(r.total_stableford_points);
    });
    // Add historical extra rounds
    Object.entries(EXTRA_ROUNDS_BY_GOLFER).forEach(([gid, rounds]) => {
      const id = parseInt(gid);
      const g = golfers.find(x => x.golfer_id === id);
      if (!g || g.is_guest) return;
      if (!byGolfer[id]) byGolfer[id] = [];
      byGolfer[id].push(...rounds);
    });
    return Object.entries(byGolfer)
      .filter(([, rounds]) => rounds.length >= 15)
      .map(([gid, rounds]) => ({
        golfer_id: parseInt(gid),
        avg: rounds.reduce((a, b) => a + b, 0) / rounds.length,
        rounds: rounds.length,
      }))
      .sort((a, b) => b.avg - a.avg);
  })();

  // Top 15 average
  const top15Avg = (() => {
    const byGolfer = {};
    leaderboard.forEach(r => {
      const g = golfers.find(x => x.golfer_id === r.golfer_id);
      if (!g || g.is_guest) return;
      if (!byGolfer[r.golfer_id]) byGolfer[r.golfer_id] = [];
      byGolfer[r.golfer_id].push(r.total_stableford_points);
    });
    Object.entries(EXTRA_ROUNDS_BY_GOLFER).forEach(([gid, rounds]) => {
      const id = parseInt(gid);
      const g = golfers.find(x => x.golfer_id === id);
      if (!g || g.is_guest) return;
      if (!byGolfer[id]) byGolfer[id] = [];
      byGolfer[id].push(...rounds);
    });
    return Object.entries(byGolfer)
      .filter(([, rounds]) => rounds.length >= 15)
      .map(([gid, rounds]) => {
        const top = [...rounds].sort((a, b) => b - a).slice(0, 15);
        return {
          golfer_id: parseInt(gid),
          avg: top.reduce((a, b) => a + b, 0) / top.length,
          rounds: rounds.length,
        };
      })
      .sort((a, b) => b.avg - a.avg);
  })();

  const paidCount = displayEvent ? leaderboard.filter(e => e.event_id === displayEvent.event_id && e.buy_in_paid).length : 0;
  const totalPot = paidCount * 20;
  const skinsPaidCount = displayEvent ? leaderboard.filter(e => e.event_id === displayEvent.event_id && e.skins_paid).length : 0;
  const skinsPot = skinsPaidCount * 10;

  return (
    <div>
      <div className="section-title">Leaderboard</div>
      <div className="section-sub">2025 Season · Saturday School</div>

      <div className="tab-sub">
        {[{ id: "current", label: "Event" }, { id: "season", label: "Season Avg" }, { id: "top15", label: "Top 15 Avg" }, { id: "finance", label: "Payouts" }].map(t => (
          <button key={t.id} className={`tab-sub-btn${subTab === t.id ? " active" : ""}`} onClick={() => setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {subTab === "current" && (
        <>
          <div className="form-group">
            <label className="form-label">Select Event</label>
            <select className="form-select" value={displayEvent?.event_id || ""} onChange={e => setSelectedEvent(completedEvents.find(ev => ev.event_id === parseInt(e.target.value)) || null)}>
              {completedEvents.map(ev => (
                <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {courses.find(c => c.course_id === ev.course_id)?.course_name}</option>
              ))}
            </select>
          </div>
          {displayEvent && (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-value">{paidCount}</div>
                  <div className="stat-label">Players</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: "var(--gold-600)" }}>R{totalPot}</div>
                  <div className="stat-label">Stableford Pot</div>
                </div>
              </div>
              {eventEntries.length > 0 && (
                <div className="podium-row">
                  {eventEntries.slice(0, 3).map((e, i) => (
                    <div key={e.summary_id} className={`podium-card p${i + 1}`}>
                      <div className="podium-pos">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div>
                      <div className="podium-pname">{golferName(golfers, e.golfer_id).split(" ")[0]}</div>
                      <div className="podium-pscore">{e.total_stableford_points}</div>
                    </div>
                  ))}
                </div>
              )}
              {eventEntries.map((entry, i) => {
                const g = golfers.find(x => x.golfer_id === entry.golfer_id);
                return (
                  <div key={entry.summary_id} className="leaderboard-row">
                    <div className={`lb-rank ${i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""}`}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div className="lb-name">{golferName(golfers, entry.golfer_id)}</div>
                      <div className="lb-hcp">HCP {g?.current_handicap_index?.toFixed(1)} · {entry.entry_type === "Hole-by-Hole" ? "H×H" : "Total"}</div>
                    </div>
                    {entry.weekly_payout_won > 0 && <span className="pill pill-gold" style={{ marginRight: 8 }}>R{entry.weekly_payout_won}</span>}
                    {entry.skins_payout_won > 0 && <span className="pill pill-green" style={{ marginRight: 8 }}>Skin R{entry.skins_payout_won}</span>}
                    <div>
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
          <div className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Season average across all rounds. Min. 15 rounds required. Guests excluded.</p>
          </div>
          {seasonAvg.length === 0 && <div className="empty-state"><div className="empty-text">No qualifying golfers yet</div><div className="empty-sub">Requires 15+ rounds</div></div>}
          {seasonAvg.map((row, i) => {
            const g = golfers.find(x => x.golfer_id === row.golfer_id);
            return (
              <div key={row.golfer_id} className="leaderboard-row">
                <div className={`lb-rank ${i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""}`}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div className="lb-name">{golferName(golfers, row.golfer_id)}</div>
                  <div className="lb-hcp">HCP {g?.current_handicap_index?.toFixed(1)} · {row.rounds} rounds</div>
                </div>
                <div>
                  <div className="lb-score">{row.avg.toFixed(1)}</div>
                  <div className="lb-pts-label">avg pts</div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {subTab === "top15" && (
        <>
          <div className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Average of best 15 rounds per golfer. Min. 15 rounds required.</p>
          </div>
          {top15Avg.map((row, i) => {
            const g = golfers.find(x => x.golfer_id === row.golfer_id);
            return (
              <div key={row.golfer_id} className="leaderboard-row">
                <div className={`lb-rank ${i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""}`}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div className="lb-name">{golferName(golfers, row.golfer_id)}</div>
                  <div className="lb-hcp">HCP {g?.current_handicap_index?.toFixed(1)} · {row.rounds} rounds</div>
                </div>
                <div>
                  <div className="lb-score">{row.avg.toFixed(1)}</div>
                  <div className="lb-pts-label">top 15 avg</div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {subTab === "finance" && displayEvent && (
        <FinanceView golfers={golfers} leaderboard={leaderboard} events={completedEvents} courses={courses} />
      )}
    </div>
  );
}

function FinanceView({ golfers, leaderboard, events, courses }) {
  const [selEvent, setSelEvent] = useState(events[0]?.event_id || null);
  const ev = events.find(e => e.event_id === selEvent);
  const entries = leaderboard.filter(e => e.event_id === selEvent);
  const paidIn = entries.filter(e => e.buy_in_paid).length;
  const skinsPaid = entries.filter(e => e.skins_paid).length;
  const charityPaid = entries.filter(e => e.charity_paid).length;
  const totalPot = paidIn * 20;
  const skinsPot = skinsPaid * 10;
  const charityPot = charityPaid * 5;

  const allCharityPaid = leaderboard.filter(e => e.charity_paid).length;
  const lifetimeCharity = allCharityPaid * 5;

  return (
    <div>
      <div className="charity-hero">
        <div className="charity-label">Lifetime Charity Pot</div>
        <div className="charity-amount">R{lifetimeCharity}</div>
        <div className="charity-label" style={{ marginTop: 4 }}>{allCharityPaid} charity entries recorded</div>
      </div>

      <div className="form-group">
        <label className="form-label">Select Event</label>
        <select className="form-select" value={selEvent || ""} onChange={e => setSelEvent(parseInt(e.target.value))}>
          {events.map(ev => (
            <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)}</option>
          ))}
        </select>
      </div>

      {ev && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value">R{totalPot}</div>
              <div className="stat-label">Stableford Pot</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">R{skinsPot}</div>
              <div className="stat-label">Skins Pot</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">R{charityPot}</div>
              <div className="stat-label">Charity</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">R{totalPot + skinsPot + charityPot}</div>
              <div className="stat-label">Total Collected</div>
            </div>
          </div>

          <div className="card-title" style={{ marginBottom: 8 }}>Payout Detail</div>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Golfer</th>
                <th style={{ textAlign: "right" }}>Stableford</th>
                <th style={{ textAlign: "right" }}>Skins</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {entries
                .filter(e => e.weekly_payout_won > 0 || e.skins_payout_won > 0)
                .map(e => (
                  <tr key={e.summary_id}>
                    <td>{golferName(golfers, e.golfer_id)}</td>
                    <td style={{ textAlign: "right" }} className="money">R{e.weekly_payout_won.toFixed(0)}</td>
                    <td style={{ textAlign: "right" }} className="money">R{e.skins_payout_won.toFixed(0)}</td>
                    <td style={{ textAlign: "right" }} className="money">R{(e.weekly_payout_won + e.skins_payout_won).toFixed(0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ============================================================
// RSVP TAB
// ============================================================
function RSVPTab({ golfers, events, signups, setSignups, showSuccess }) {
  const upcoming = events
    .filter(e => e.status !== "Completed")
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const [selectedGolfer, setSelectedGolfer] = useState("");

  if (!upcoming) return <div className="empty-state"><div className="empty-text">No upcoming events</div></div>;

  const eventSignups = signups.filter(s => s.event_id === upcoming.event_id);
  const yesCount = eventSignups.filter(s => s.attending === "Yes").length;
  const noCount = eventSignups.filter(s => s.attending === "No").length;

  const updateAttending = (golfer_id, val) => {
    setSignups(prev => prev.map(s =>
      s.event_id === upcoming.event_id && s.golfer_id === golfer_id
        ? { ...s, attending: val }
        : s
    ));
    showSuccess(`RSVP updated for ${golferName(golfers, golfer_id)}`);
  };

  const addGuestSignup = () => {
    const newSignup = {
      signup_id: Date.now(),
      event_id: upcoming.event_id,
      golfer_id: 99,
      attending: "Yes",
      assigned_tee_time: null,
      playing_handicap: null,
    };
    setSignups(prev => [...prev, newSignup]);
    showSuccess("Guest added to RSVP");
  };

  return (
    <div>
      <div className="section-title">RSVP Board</div>
      <div className="section-sub">{formatDate(upcoming.date)}</div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{upcoming.course_id === 1 ? "Randpark GC" : upcoming.course_id === 2 ? "Houghton GC" : "Royal JHB East"}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{upcoming.tee_times[0]} first tee</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="pill pill-green">✓ {yesCount} going</span>
            {noCount > 0 && <span className="pill pill-red" style={{ marginLeft: 4 }}>✗ {noCount} out</span>}
          </div>
        </div>
        <div className="info-row">
          <span className="info-key">Status</span>
          <span className="pill pill-gold">{upcoming.status}</span>
        </div>
        <div className="info-row">
          <span className="info-key">Tee times</span>
          <span className="info-val">{upcoming.tee_times.join(" · ")}</span>
        </div>
      </div>

      <div className="card-title" style={{ marginBottom: 10 }}>Update Your RSVP</div>
      {eventSignups.map(signup => {
        const g = golfers.find(x => x.golfer_id === signup.golfer_id);
        if (!g) return null;
        return (
          <div key={signup.signup_id} className="rsvp-row">
            <div className="rsvp-name">{g.first_name} {g.last_name}</div>
            <div className="rsvp-actions">
              <button className={`rsvp-btn yes${signup.attending === "Yes" ? " active" : ""}`} onClick={() => updateAttending(signup.golfer_id, "Yes")}>In</button>
              <button className={`rsvp-btn no${signup.attending === "No" ? " active" : ""}`} onClick={() => updateAttending(signup.golfer_id, "No")}>Out</button>
            </div>
          </div>
        );
      })}
      <button className="btn btn-outline btn-full" style={{ marginTop: 12 }} onClick={addGuestSignup}>+ Add Guest</button>
    </div>
  );
}

// ============================================================
// SCORE ENTRY TAB
// ============================================================
function ScoreEntryTab({ golfers, courses, events, signups, leaderboard, setLeaderboard, holeScores, setHoleScores, setEvents, showSuccess }) {
  const [mode, setMode] = useState("total");
  const [selectedGolferId, setSelectedGolferId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [totalPts, setTotalPts] = useState("");
  const [grossScores, setGrossScores] = useState(Array(18).fill(""));
  const [submitted, setSubmitted] = useState(false);

  const activeEvents = events.filter(e => e.status === "Pairings Set" || e.status === "In-Progress");
  const selEvent = events.find(e => e.event_id === parseInt(selectedEventId));
  const selCourse = selEvent ? courses.find(c => c.course_id === selEvent.course_id) : null;

  const signup = selEvent && selectedGolferId
    ? signups.find(s => s.event_id === selEvent.event_id && s.golfer_id === parseInt(selectedGolferId))
    : null;

  const playingHcp = signup?.playing_handicap ?? 0;

  const holeCalcs = selCourse && mode === "hole"
    ? calcHoleScores(grossScores.map(v => v ? parseInt(v) : null), playingHcp, selCourse)
    : [];

  const totalCalcPts = holeCalcs.reduce((sum, h) => sum + (h.points ?? 0), 0);

  const alreadyEntered = selEvent && selectedGolferId
    ? leaderboard.some(r => r.event_id === selEvent.event_id && r.golfer_id === parseInt(selectedGolferId))
    : false;

  const handleSubmit = () => {
    if (!selectedGolferId || !selectedEventId) return;
    const gid = parseInt(selectedGolferId);
    const eid = parseInt(selectedEventId);
    const pts = mode === "total" ? parseInt(totalPts) : totalCalcPts;
    if (!pts || pts < 0) return;

    const newSummaryId = Date.now();
    const newEntry = {
      summary_id: newSummaryId,
      event_id: eid,
      golfer_id: gid,
      entry_type: mode === "hole" ? "Hole-by-Hole" : "Total Only",
      total_stableford_points: pts,
      buy_in_paid: true,
      skins_paid: mode === "hole",
      charity_paid: true,
      weekly_payout_won: 0,
      skins_payout_won: 0,
    };

    if (alreadyEntered) {
      setLeaderboard(prev => prev.map(r => r.event_id === eid && r.golfer_id === gid ? newEntry : r));
    } else {
      setLeaderboard(prev => [...prev, newEntry]);
    }

    if (mode === "hole") {
      grossScores.forEach((g, i) => {
        if (!g) return;
        const net = calcHoleNetScore(parseInt(g), playingHcp, selCourse.hole_stroke_indices[i]);
        const pts2 = calcStablefordPoints(net, selCourse.hole_pars[i]);
        setHoleScores(prev => [...prev, {
          score_id: Date.now() + i,
          summary_id: newSummaryId,
          hole_number: i + 1,
          gross_score: parseInt(g),
          net_score: net,
          stableford_points: pts2,
        }]);
      });
    }

    showSuccess(`Score submitted: ${golferName(golfers, gid)} — ${pts} pts`);
    setSubmitted(true);
    setTotalPts("");
    setGrossScores(Array(18).fill(""));
    setTimeout(() => setSubmitted(false), 2000);
  };

  const ptsClass = (pts) => {
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
        <button className={`toggle-btn${mode === "total" ? " active" : ""}`} onClick={() => setMode("total")}>Total Only</button>
        <button className={`toggle-btn${mode === "hole" ? " active" : ""}`} onClick={() => setMode("hole")}>Hole by Hole</button>
      </div>

      <div className="form-group">
        <label className="form-label">Event</label>
        <select className="form-select" value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)}>
          <option value="">Select event…</option>
          {activeEvents.map(ev => (
            <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {courses.find(c => c.course_id === ev.course_id)?.course_name}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Golfer</label>
        <select className="form-select" value={selectedGolferId} onChange={e => setSelectedGolferId(e.target.value)}>
          <option value="">Select golfer…</option>
          {golfers.filter(g => g.status === "Active").map(g => (
            <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
          ))}
        </select>
      </div>

      {signup && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 12 }}>
          <div className="info-row">
            <span className="info-key">Playing Handicap</span>
            <span className="info-val" style={{ color: "var(--green-700)", fontWeight: 700, fontSize: 18 }}>{playingHcp}</span>
          </div>
          <div className="info-row">
            <span className="info-key">Tee Time</span>
            <span className="info-val">{signup.assigned_tee_time || "—"}</span>
          </div>
          {alreadyEntered && <div style={{ fontSize: 12, color: "var(--gold-700)", marginTop: 6 }}>⚠ Score already entered – will be overwritten</div>}
        </div>
      )}

      {mode === "total" && (
        <div className="form-group">
          <label className="form-label">Total Stableford Points</label>
          <input className="form-input" type="number" min="0" max="72" placeholder="e.g. 36" value={totalPts} onChange={e => setTotalPts(e.target.value)} />
        </div>
      )}

      {mode === "hole" && selCourse && (
        <div className="score-grid">
          <table className="score-table">
            <thead>
              <tr>
                <th>Hole</th>
                <th>Par</th>
                <th>SI</th>
                <th>Gross</th>
                <th>Net</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 18 }, (_, i) => {
                const h = holeCalcs[i] || {};
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{i + 1}</td>
                    <td>{selCourse.hole_pars[i]}</td>
                    <td style={{ color: "var(--text-muted)" }}>{selCourse.hole_stroke_indices[i]}</td>
                    <td className="score-input-cell">
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={grossScores[i]}
                        onChange={e => {
                          const v = [...grossScores];
                          v[i] = e.target.value;
                          setGrossScores(v);
                        }}
                      />
                    </td>
                    <td>{h.net ?? "—"}</td>
                    <td className={ptsClass(h.points)} style={{ fontWeight: h.points !== null ? 700 : 400 }}>
                      {h.points !== null && h.points !== undefined ? h.points : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: "var(--green-50)" }}>
                <td colSpan={3} style={{ fontWeight: 700, textAlign: "left", paddingLeft: 8, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 13 }}>Total</td>
                <td>{grossScores.reduce((sum, v) => sum + (v ? parseInt(v) : 0), 0) || "—"}</td>
                <td>—</td>
                <td style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--green-700)" }}>{totalCalcPts || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <button
        className="btn btn-primary btn-full"
        style={{ marginTop: 16 }}
        disabled={!selectedGolferId || !selectedEventId || (mode === "total" ? !totalPts : totalCalcPts === 0)}
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
function AdminTab({ golfers, setGolfers, courses, events, setEvents, signups, setSignups, leaderboard, setLeaderboard, showSuccess }) {
  const [subTab, setSubTab] = useState("hcp");

  return (
    <div>
      <div className="section-title">Admin</div>
      <div className="section-sub">League management tools</div>

      <div className="tab-sub">
        {[
          { id: "hcp", label: "Handicaps" },
          { id: "events", label: "Events" },
          { id: "pairings", label: "Pairings" },
        ].map(t => (
          <button key={t.id} className={`tab-sub-btn${subTab === t.id ? " active" : ""}`} onClick={() => setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {subTab === "hcp" && <HandicapManager golfers={golfers} setGolfers={setGolfers} showSuccess={showSuccess} />}
      {subTab === "events" && <EventCreator courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} golfers={golfers} showSuccess={showSuccess} />}
      {subTab === "pairings" && <PairingDashboard golfers={golfers} courses={courses} events={events} setEvents={setEvents} signups={signups} setSignups={setSignups} showSuccess={showSuccess} />}
    </div>
  );
}

function HandicapManager({ golfers, setGolfers, showSuccess }) {
  const [edits, setEdits] = useState({});

  const handleSave = () => {
    setGolfers(prev => prev.map(g => edits[g.golfer_id] !== undefined
      ? { ...g, current_handicap_index: parseFloat(edits[g.golfer_id]) || g.current_handicap_index }
      : g
    ));
    setEdits({});
    showSuccess("Handicap indices updated");
  };

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 10 }}>Weekly Handicap Update</div>
      {golfers.filter(g => !g.is_guest && g.status === "Active").map(g => (
        <div key={g.golfer_id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{g.first_name} {g.last_name}</div>
          <input
            type="number"
            step="0.1"
            min="0"
            max="54"
            style={{ width: 70, padding: "6px 8px", border: "1.5px solid var(--border-md)", borderRadius: "var(--radius-md)", fontFamily: "Barlow, sans-serif", fontSize: 15, textAlign: "center" }}
            value={edits[g.golfer_id] !== undefined ? edits[g.golfer_id] : g.current_handicap_index}
            onChange={e => setEdits(prev => ({ ...prev, [g.golfer_id]: e.target.value }))}
          />
        </div>
      ))}
      <button className="btn btn-primary btn-full" style={{ marginTop: 12 }} onClick={handleSave}>Save All Handicaps</button>
    </div>
  );
}

function EventCreator({ courses, events, setEvents, signups, setSignups, golfers, showSuccess }) {
  const [date, setDate] = useState("");
  const [courseId, setCourseId] = useState("");
  const [teeTimes, setTeeTimes] = useState("08:00\n08:10\n08:20\n08:30");

  const handleCreate = () => {
    if (!date || !courseId) return;
    const newId = Math.max(...events.map(e => e.event_id), 0) + 1;
    const tts = teeTimes.split("\n").map(t => t.trim()).filter(Boolean);
    const newEvent = { event_id: newId, date, course_id: parseInt(courseId), tee_times: tts, status: "Upcoming" };
    setEvents(prev => [...prev, newEvent]);
    // Auto-create signups for all active golfers
    const activeGolfers = golfers.filter(g => !g.is_guest && g.status === "Active");
    const newSignups = activeGolfers.map((g, i) => ({
      signup_id: Date.now() + i,
      event_id: newId,
      golfer_id: g.golfer_id,
      attending: "Unconfirmed",
      assigned_tee_time: null,
      playing_handicap: null,
    }));
    setSignups(prev => [...prev, ...newSignups]);
    showSuccess(`Event created: ${formatDate(date)}`);
    setDate(""); setCourseId(""); setTeeTimes("08:00\n08:10\n08:20\n08:30");
  };

  const activeEmails = golfers.filter(g => !g.is_guest && g.status === "Active" && g.email_address).map(g => g.email_address);
  const mailtoLink = `mailto:?bcc=${activeEmails.join(",")}&subject=Saturday School – Upcoming Round&body=Hi all, join us for our next Saturday round. Please RSVP on the app!`;

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 10 }}>Create New Event</div>
      <div className="form-group">
        <label className="form-label">Date</label>
        <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Course</label>
        <select className="form-select" value={courseId} onChange={e => setCourseId(e.target.value)}>
          <option value="">Select course…</option>
          {courses.map(c => <option key={c.course_id} value={c.course_id}>{c.course_name} ({c.tee_box_name})</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Tee Times (one per line)</label>
        <textarea className="form-input" rows={5} value={teeTimes} onChange={e => setTeeTimes(e.target.value)} style={{ resize: "vertical" }} />
      </div>
      <button className="btn btn-primary btn-full" onClick={handleCreate}>Create Event</button>
      <hr className="divider" />
      <div className="card-title" style={{ marginBottom: 8 }}>Invite Email</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>Generates a mailto: link with all active member email addresses.</p>
      <a href={mailtoLink} className="btn btn-outline btn-full" style={{ textDecoration: "none", display: "flex" }}>✉ Open Invitation Email</a>
    </div>
  );
}

function PairingDashboard({ golfers, courses, events, setEvents, signups, setSignups, showSuccess }) {
  const [selEventId, setSelEventId] = useState(events.find(e => e.status !== "Completed")?.event_id || "");
  const [pairings, setPairings] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const selEvent = events.find(e => e.event_id === parseInt(selEventId));
  const eventSignups = selEvent ? signups.filter(s => s.event_id === selEvent.event_id && s.attending === "Yes") : [];
  const course = selEvent ? courses.find(c => c.course_id === selEvent.course_id) : null;
  const par = course ? coursePar(course) : 72;

  const runPairings = () => {
    const golferIds = eventSignups.map(s => s.golfer_id);
    const groups = runPairingEngine(golferIds, selEvent.tee_times);
    setPairings(groups);
    setConfirmed(false);
  };

  const confirmPairings = () => {
    if (!pairings) return;
    const updates = {};
    pairings.forEach(group => {
      group.players.forEach(gid => { updates[gid] = group.teeTime; });
    });
    setSignups(prev => prev.map(s => {
      if (s.event_id !== selEvent.event_id || !updates[s.golfer_id]) return s;
      const g = golfers.find(x => x.golfer_id === s.golfer_id);
      const phcp = course ? calcPlayingHandicap(g.current_handicap_index, course.tee_slope, course.tee_rating, par) : 0;
      return { ...s, assigned_tee_time: updates[s.golfer_id], playing_handicap: phcp };
    }));
    setEvents(prev => prev.map(e => e.event_id === selEvent.event_id ? { ...e, status: "Pairings Set" } : e));
    setConfirmed(true);
    showSuccess("Pairings confirmed and playing handicaps calculated");
  };

  const buildPairingEmailBody = () => {
    if (!pairings) return "";
    let body = `Saturday School – Pairings for ${formatDate(selEvent?.date)}\n\n`;
    pairings.forEach((g, i) => {
      body += `Group ${i + 1} – Tee: ${g.teeTime}\n`;
      g.players.forEach(gid => {
        const golfer = golfers.find(x => x.golfer_id === gid);
        const ph = course ? calcPlayingHandicap(golfer.current_handicap_index, course.tee_slope, course.tee_rating, par) : "—";
        body += `  • ${golfer.first_name} ${golfer.last_name} (Playing HCP: ${ph})\n`;
      });
      body += "\n";
    });
    return body;
  };

  const activeEmails = golfers.filter(g => !g.is_guest && g.status === "Active" && g.email_address).map(g => g.email_address);

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 10 }}>Pairing Engine</div>
      <div className="form-group">
        <label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e => { setSelEventId(e.target.value); setPairings(null); setConfirmed(false); }}>
          <option value="">Select event…</option>
          {events.filter(e => e.status !== "Completed").map(ev => (
            <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} — {courses.find(c => c.course_id === ev.course_id)?.course_name}</option>
          ))}
        </select>
      </div>

      {selEvent && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 12 }}>
          <div className="info-row"><span className="info-key">Confirmed players</span><span className="info-val" style={{ color: "var(--green-700)", fontWeight: 700 }}>{eventSignups.length}</span></div>
          <div className="info-row"><span className="info-key">Tee times available</span><span className="info-val">{selEvent.tee_times.length}</span></div>
          <div className="info-row"><span className="info-key">Groups (auto)</span><span className="info-val">{eventSignups.length > 0 ? Math.ceil(eventSignups.length / 4) : "—"}</span></div>
        </div>
      )}

      <button className="btn btn-gold btn-full" onClick={runPairings} disabled={!selEvent || eventSignups.length < 2}>
        🎲 Generate Pairings
      </button>

      {pairings && (
        <div style={{ marginTop: 14 }}>
          {pairings.map((group, i) => (
            <div key={i} className="pairing-card">
              <div className="pairing-header">
                <span className="pairing-time">⏱ {group.teeTime}</span>
                <span className="pairing-group">Group {i + 1} · {group.players.length} players</span>
              </div>
              <div className="pairing-body">
                {group.players.map(gid => {
                  const g = golfers.find(x => x.golfer_id === gid);
                  const ph = course ? calcPlayingHandicap(g.current_handicap_index, course.tee_slope, course.tee_rating, par) : "—";
                  return (
                    <div key={gid} className="pairing-player">
                      <span>{g.first_name} {g.last_name}</span>
                      <span className="pairing-hcp">Playing HCP {ph}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmPairings} disabled={confirmed}>
              {confirmed ? "✓ Confirmed" : "Confirm Pairings"}
            </button>
            <a
              href={`mailto:?bcc=${activeEmails.join(",")}&subject=Saturday School Pairings – ${formatDate(selEvent?.date)}&body=${encodeURIComponent(buildPairingEmailBody())}`}
              className="btn btn-outline"
              style={{ flex: 1, textDecoration: "none", display: "flex", justifyContent: "center", alignItems: "center" }}
            >
              ✉ Email Groups
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANALYTICS TAB
// ============================================================
function AnalyticsTab({ golfers, courses, events, leaderboard }) {
  const [subTab, setSubTab] = useState("course");
  const [selGolfer, setSelGolfer] = useState("");

  // Course averages
  const courseAvgs = courses.map(course => {
    const evIds = events.filter(e => e.course_id === course.course_id).map(e => e.event_id);
    const entries = leaderboard.filter(r => evIds.includes(r.event_id) && !golfers.find(g => g.golfer_id === r.golfer_id)?.is_guest);
    const avg = entries.length ? entries.reduce((s, r) => s + r.total_stableford_points, 0) / entries.length : 0;
    return { course, avg, count: entries.length };
  });

  // Handicap vs performance scatter
  const scatterData = golfers
    .filter(g => !g.is_guest && g.status === "Active")
    .map(g => {
      const rounds = [
        ...leaderboard.filter(r => r.golfer_id === g.golfer_id).map(r => r.total_stableford_points),
        ...(EXTRA_ROUNDS_BY_GOLFER[g.golfer_id] || []),
      ];
      if (rounds.length === 0) return null;
      const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
      return { golfer: g, hcp: g.current_handicap_index, avg, rounds: rounds.length };
    })
    .filter(Boolean);

  // Per-golfer history
  const selG = golfers.find(g => g.golfer_id === parseInt(selGolfer));
  const golferRounds = selG
    ? [
        ...leaderboard.filter(r => r.golfer_id === selG.golfer_id).map(r => ({ pts: r.total_stableford_points, event_id: r.event_id })),
        ...(EXTRA_ROUNDS_BY_GOLFER[selG.golfer_id] || []).map((pts, i) => ({ pts, event_id: -(i + 1) })),
      ].sort((a, b) => a.event_id - b.event_id)
    : [];

  return (
    <div>
      <div className="section-title">Analytics</div>
      <div className="section-sub">2025 Season Performance</div>

      <div className="tab-sub">
        {[{ id: "course", label: "By Course" }, { id: "scatter", label: "HCP vs Pts" }, { id: "golfer", label: "Golfer History" }].map(t => (
          <button key={t.id} className={`tab-sub-btn${subTab === t.id ? " active" : ""}`} onClick={() => setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {subTab === "course" && (
        <CourseChart courseAvgs={courseAvgs} />
      )}
      {subTab === "scatter" && (
        <ScatterChart scatterData={scatterData} />
      )}
      {subTab === "golfer" && (
        <>
          <div className="form-group">
            <label className="form-label">Select Golfer</label>
            <select className="form-select" value={selGolfer} onChange={e => setSelGolfer(e.target.value)}>
              <option value="">Choose golfer…</option>
              {golfers.filter(g => !g.is_guest && g.status === "Active").map(g => (
                <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>
              ))}
            </select>
          </div>
          {selG && golferRounds.length > 0 && (
            <GolferHistoryChart golfer={selG} rounds={golferRounds} />
          )}
        </>
      )}
    </div>
  );
}

function CourseChart({ courseAvgs }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = window.Chart?.instances ? Object.values(window.Chart.instances) : [];
    existing.forEach(c => { try { if (c.canvas?.id === "courseChart") c.destroy(); } catch (e) {} });
    if (!window.Chart) return;
    const ctx = document.getElementById("courseChart");
    if (!ctx) return;
    new window.Chart(ctx, {
      type: "bar",
      data: {
        labels: courseAvgs.map(c => c.course.course_name.replace("Golf Club", "GC")),
        datasets: [{
          label: "Avg Stableford Points",
          data: courseAvgs.map(c => parseFloat(c.avg.toFixed(1))),
          backgroundColor: ["#1a7340", "#c47800", "#c02020"],
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y.toFixed(1)} pts avg` } },
        },
        scales: {
          y: {
            beginAtZero: false,
            min: 20,
            ticks: { color: "#6b5240", font: { family: "Barlow Condensed, sans-serif", size: 13 } },
            grid: { color: "rgba(74,55,40,0.1)" },
          },
          x: {
            ticks: { color: "#6b5240", font: { family: "Barlow Condensed, sans-serif", size: 12 } },
            grid: { display: false },
          },
        },
      },
    });
  }, [courseAvgs]);

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 10 }}>Stableford Averages by Course</div>
      {courseAvgs.map(c => (
        <div key={c.course.course_id} className="info-row">
          <span className="info-key">{c.course.course_name}</span>
          <span className="info-val">{c.count > 0 ? `${c.avg.toFixed(1)} pts (${c.count} rounds)` : "No data"}</span>
        </div>
      ))}
      <div style={{ position: "relative", width: "100%", height: 200, marginTop: 16 }}>
        <canvas id="courseChart" role="img" aria-label="Bar chart of average stableford points by course">Average stableford points per course</canvas>
      </div>
      <script dangerouslySetInnerHTML={{ __html: "" }} />
    </div>
  );
}

function ScatterChart({ scatterData }) {
  useEffect(() => {
    if (!window.Chart) return;
    const existing = window.Chart?.instances ? Object.values(window.Chart.instances) : [];
    existing.forEach(c => { try { if (c.canvas?.id === "scatterChart") c.destroy(); } catch (e) {} });
    const ctx = document.getElementById("scatterChart");
    if (!ctx) return;
    new window.Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [{
          label: "Golfers",
          data: scatterData.map(d => ({ x: d.hcp, y: parseFloat(d.avg.toFixed(1)), name: `${d.golfer.first_name} ${d.golfer.last_name}` })),
          backgroundColor: "#1a7340",
          pointRadius: 7,
          pointHoverRadius: 9,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.raw.name}: HCP ${ctx.raw.x} → ${ctx.raw.y.toFixed(1)} pts avg`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Handicap Index", color: "#6b5240", font: { family: "Barlow Condensed, sans-serif", size: 13 } },
            ticks: { color: "#6b5240" },
            grid: { color: "rgba(74,55,40,0.1)" },
          },
          y: {
            title: { display: true, text: "Avg Stableford Pts", color: "#6b5240", font: { family: "Barlow Condensed, sans-serif", size: 13 } },
            ticks: { color: "#6b5240" },
            grid: { color: "rgba(74,55,40,0.1)" },
          },
        },
      },
    });
  }, [scatterData]);

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 4 }}>Handicap Index vs Avg Performance</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Players above the trend perform better than expected. Tap a dot for details.</p>
      <div style={{ position: "relative", width: "100%", height: 260 }}>
        <canvas id="scatterChart" role="img" aria-label="Scatter plot of handicap index vs average stableford points">Handicap vs stableford performance for all active golfers</canvas>
      </div>
    </div>
  );
}

function GolferHistoryChart({ golfer, rounds }) {
  useEffect(() => {
    if (!window.Chart) return;
    const existing = window.Chart?.instances ? Object.values(window.Chart.instances) : [];
    existing.forEach(c => { try { if (c.canvas?.id === "histChart") c.destroy(); } catch (e) {} });
    const ctx = document.getElementById("histChart");
    if (!ctx) return;
    const labels = rounds.map((_, i) => `R${i + 1}`);
    const data = rounds.map(r => r.pts);
    const avgLine = Array(rounds.length).fill(parseFloat((data.reduce((a, b) => a + b, 0) / data.length).toFixed(1)));
    new window.Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Points",
            data,
            borderColor: "#1a7340",
            backgroundColor: "rgba(26,115,64,0.08)",
            pointBackgroundColor: "#1a7340",
            pointRadius: 4,
            fill: true,
            tension: 0.3,
          },
          {
            label: "Season Avg",
            data: avgLine,
            borderColor: "#c47800",
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: "#6b5240", font: { size: 11 }, maxTicksLimit: 10 },
            grid: { display: false },
          },
          y: {
            min: 15,
            ticks: { color: "#6b5240" },
            grid: { color: "rgba(74,55,40,0.1)" },
          },
        },
      },
    });
  }, [golfer, rounds]);

  const avg = (rounds.reduce((s, r) => s + r.pts, 0) / rounds.length).toFixed(1);
  const best = Math.max(...rounds.map(r => r.pts));
  const worst = Math.min(...rounds.map(r => r.pts));

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card">
          <div className="stat-value">{avg}</div>
          <div className="stat-label">Season Avg</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rounds.length}</div>
          <div className="stat-label">Rounds</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--gold-600)" }}>{best}</div>
          <div className="stat-label">Best Round</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--red-600)" }}>{worst}</div>
          <div className="stat-label">Worst Round</div>
        </div>
      </div>
      <div className="card-title" style={{ marginBottom: 6 }}>
        {golfer.first_name} {golfer.last_name} — Round History
        <span style={{ marginLeft: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)", fontFamily: "Barlow, sans-serif", fontWeight: 400 }}>
            <span style={{ width: 14, height: 3, background: "#1a7340", display: "inline-block", borderRadius: 2 }}></span> Rounds
            <span style={{ width: 14, height: 3, background: "#c47800", display: "inline-block", borderRadius: 2, marginLeft: 6 }}></span> Avg
          </span>
        </span>
      </div>
      <div style={{ position: "relative", width: "100%", height: 200 }}>
        <canvas id="histChart" role="img" aria-label={`Line chart of ${golfer.first_name} ${golfer.last_name}'s round history`}>Round history for {golfer.first_name} {golfer.last_name}</canvas>
      </div>
    </div>
  );
}
