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

Active focus: 2026-07-06 full-app audit → two fix batches (2026-07-07):
(1) payouts/dedupe, offline score entry, RSVP crash, odds vig/staleness/memoization, weather races, StrictMode double-inserts, dead-code removal;
(2) offline-first PWA (vite-plugin-pwa precache + IndexedDB write outbox + sync pill), silent-catch sweep → reportWriteError, fonts to index.html, reduced-motion support, WindParticles DPR/pause, Saturday Handicap chart windowing.

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

- Upcoming event leaderboard formatting (last commit, possibly ongoing)

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
