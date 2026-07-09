# Working Context

_Last updated: 2026-07-07. Update this file when starting/finishing features or discovering bugs._

---

## Recent Work (last 5 commits)

| Commit | Summary |
|--------|---------|
| `673dd57` | bug fix |
| `b82c470` | saturday handicap (WHS engine: lib/saturdayHandicap.ts + adapter + chart) |
| `806878c` | analytics dropdown |
| `e4eab39` | course handicap trend |
| `c47ec7d` | updated gif |

Active focus: 2026-07-06 full-app audit → three fix batches (2026-07-07):
(1) payouts/dedupe, offline score entry, RSVP crash, odds vig/staleness/memoization, weather races, StrictMode double-inserts, dead-code removal;
(2) offline-first PWA (vite-plugin-pwa precache + IndexedDB write outbox + sync pill), silent-catch sweep → reportWriteError, fonts to index.html, reduced-motion support, WindParticles DPR/pause, Saturday Handicap chart windowing;
(3) vig only in payout odds (Win % now raw, sums to 100% — applyVig() in monteCarlo), charity edit persistence (dbUpdateCharity PATCH path), outbox hardening (pre-mount error buffer + 5xx/429 retry w/ attempts counter, drop only on 4xx), scratch-handicap 0→18 coercions (GolferRoster + guest quick-add), ScoreCorrection add-golfer double-insert/temp-summary_id fix, hole-image insert array-vs-row fix, estimateHolePts weight inversion, pairing engine player-unit sizing + waiting-room overflow (no more 5-7 player groups) + assignLateAdd latest-tee behavior, chart deps include plotted values, event delete now removes its leaderboard rows.

---

## Known Issues / Bugs

- Nav indicator alignment was recently fixed (3 commits) — treat nav layout as potentially fragile
- 2026-07-06 audit found ~90 issues; the highest-priority batch is being fixed now. Notable
  still-open items (deliberately deferred): modals paint under the bottom nav
  (`.tab-pane` `will-change: opacity` stacking context vs nav z-index 200 — portal modals to body),
  NaN guard missing in saturdayHandicap.ts adjustedGross, front/back-nine split by array index in
  LeaderboardTab/GolferHistoryChart, no offline support (sw.js is push-only), 6.2s forced splash.

---

## Features In Progress

- DONE 2026-07-08: Member identity + persistent logins. Admin unlock moved from
  sessionStorage to localStorage (`ss_admin`) and auto-restored on boot, so it
  survives an iOS force-quit; cleared only via the profile-icon logout. New
  member identity (personalization only, no auth): first-run "Who are you?"
  picker in App.tsx (localStorage `ss_member` + `ss_member_skip` for the
  "just browsing" dismissal), changeable via the new Your Profile card in
  SettingsTab. The picker auto-shows on load only in the installed PWA
  (html.is-pwa from index.html's standalone detection); in a plain mobile
  browser (e.g. emailed links) it waits until the Settings tab is opened. Drives a time-of-day greeting in AppHeader
  (`.app-bar__greeting`) and gold `.me-row` highlights (accent bar + wash,
  CSS in App.tsx) on season/top15/weekly lb-rows, live + upcoming-field rows
  in LeaderboardTab, and the member's RSVP row. Also defaults selections:
  Analytics > By Golfer pre-selects the member, and Analytics > Odds >
  Head-to-Head pre-selects them as Golfer A (lazy useState init in
  AnalyticsTab/OddsTab, only when the member passes the picker's
  active-non-guest filter). RSVP "Member Sign Ups" list hoists the member's
  row (with their nested guest rows) to the top, rest stay alphabetical.
  Weekly feed EventFeedCards: the date pill turns gold (same treatment as the
  "1st" chip) on events the member has a leaderboard entry for — subtle
  played-it marker, no extra badge. Analytics > Pts Gained: me-row accents on
  every PGLeaderboard (all categories + yardage/hole subcategories), on
  overview leader rows when the member leads, and on the member's row in the
  Consistency table (inline gold there — its zebra striping is inline styles).
  Profile view (src/tabs/settings/ProfileView.tsx): "Welcome, Name" season
  snapshot — Season Avg + Top 15 standings with week-over-week rank delta
  (standings vs standings minus latest event, mirrors LeaderboardTab math),
  last round (gross from hole_scores, finish, derived skins $ — stored
  skins_payout_won is always 0; scorecard was tried then removed as clutter),
  next-event RSVP status w/ early-tee badge (filled pills matching the RSVP
  tab's active In/Out buttons; when the member's assigned_tee_time is set the
  card is promoted above the standings cards and shows tee time + group
  chips). Standings cards scroll the leaderboard to the member's row
  (LeaderboardTab initialScrollToMe — NOTE: no done-ref guard; StrictMode
  double-invokes mount effects with the same refs, a guard set in run 1
  suppresses run 2 after cleanup cleared run 1's timer). Last Round card
  opens the event detail scrolled to the POS/GOLFER/PTS/$$$ table.
  IMPORTANT iOS PWA gotcha: never use scrollIntoView for these deep-link
  scrolls — in standalone mode it also scrolls the window/body, lifting the
  whole app shell out of the safe areas. Scroll the owning container
  (.main-content / the feed-overlay node) via scrollTo, and offset overlay
  targets by env(safe-area-inset-top) (measured via a fixed probe div).
  Settings tab header is contextual: Profile subtab shows "Welcome, X / Your
  YYYY season at a glance", Settings subtab shows the normal header; the
  ProfileView greeting block renders in overlay mode only. "View More Stats"
  button at the profile's bottom deep-links to Analytics > By Golfer
  (member pre-selected) with a "← Return to Profile" back chip — the
  analytics back chip's destination is now App state analyticsBackTarget
  ("leaderboard" | "settings"), reset to leaderboard after use. Header
  greeting is absolutely centred on the app bar (unequal logo/profile widths
  pushed flex centring off) and fades out 20s after load (1.2s opacity
  transition in AppHeader; timer restarts when the greeting text changes);
  profile stat strip uses a 3-col grid for true centring. Testing tip: the signups table is event_signups; Playwright
  page.route can inject pairings, but block service workers in the context.
  Cards deep-link: leaderboard subtabs via lbRestoreSubTab, weekly event
  detail via new LeaderboardTab initialOpenEventId prop, RSVP tab. Shown as
  full-screen overlay after the first-run picker; permanently lives under
  Settings > Profile subtab (ToggleGroup Profile|Settings, defaults to
  Profile when identity set). Score Entry deliberately untouched (user opted out).
- Upcoming event leaderboard formatting (last commit, possibly ongoing)
- DONE 2026-07-07: Score Entry side-game lens — pill on the Score Sheet swaps to
  "Nines" (3 started scorers; 5/3/1 pool per hole, ties split, always integers) or
  "Sixes" (4 scorers; 2v2 best-ball skins, teams rotate every 6 holes, pairing chips
  pick player 0's partner per stretch, carryovers cross segments, forfeited after 18).
  Math in `src/lib/sideGames.ts` (pure); nets use handicaps reduced to the group low
  man via calcHoleNetScore. Display-only — no DB writes, local component state.

---

## Hot Files (most likely to be touched)

1. `src/App.tsx` — global state, tab routing, everything flows through here
2. `src/tabs/leaderboard/LeaderboardTab.tsx` — recent active work
3. `src/tabs/leaderboard/UpcomingCourseCard.tsx` — upcoming event display
4. `src/components/nav/BottomNav.tsx` — recently fixed, handle carefully
5. `src/lib/golfMath.ts` — scoring/payout/pairing logic
6. `src/index.css` / `src/App.css` — all visual changes go here

---

## Environment Notes

- Dev server runs on port 5173 (sometimes 5175 if 5173 is taken)
- Test on physical phone via LAN: `http://[machine-ip]:5173`
- `.env` has real Supabase keys — the app talks to production DB in dev
- Admin PIN: `0602`

---

## Architecture Constraints (don't change without discussion)

- No router — manual tab state in App.tsx
- No state management library — prop drilling from App.tsx is intentional
- TypeScript strict mode is off — don't tighten it
- App.tsx being large (~2000 lines) is accepted — don't extract without being asked
