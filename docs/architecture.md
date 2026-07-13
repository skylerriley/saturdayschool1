# Architecture Reference

## Data Flow

```
Supabase PostgreSQL (via PostgREST HTTP — hand-rolled client in src/lib/supabaseClient.ts)
  │
  ├─(polling)──> App.tsx refresh loops
  │     • initial load: Promise.all over all tables on mount
  │     • background: 5-minute interval + refetch on visibilitychange
  │     • live rounds: 15-second poll while the Leaderboard "Live" subtab is open
  │     • manual: pull-to-refresh gesture
  │                       │
  │                       └─> useState (golfers, events, signups, leaderboard, holeScores, courses)
  │                               │
  │                               └─(props)──> Tab components ──(callbacks)──> REST upsert/insert
```

**There are NO Supabase real-time WebSocket subscriptions.** Data freshness is
entirely polling-based. The app does NOT use `@supabase/supabase-js`; every
module imports the hand-rolled REST wrapper `src/lib/supabaseClient.ts`, which
returns plain `Promise<any[]>` (no `{ data, error }` envelope, no query-builder
methods like `.in()`/`.eq()` chaining beyond what the wrapper implements —
check the wrapper before writing queries).

No Context API, no Redux. Tabs receive data + setter callbacks as props.

---

## Supabase Tables (inferred from usage)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `golfers` | id, name, handicap_index, phone | Player roster |
| `events` | id, date, course_id, status | Scheduled rounds |
| `signups` | event_id, golfer_id, paid, tee_time, group_num, attending, is_guest_entry, sponsor_golfer_id | RSVP + pairings |
| `hole_scores` | event_id, golfer_id, hole, gross_score | Per-hole scoring |
| `leaderboard` | event_id, golfer_id, points, gross, net | Computed results |
| `courses` | id, name, slope, rating, par, holes[] | Course database |
| `event_odds` | event_id, golfer_id, win_pct, top3_pct | Pre-computed odds |

Freshness: polling only (see Data Flow above) — no `postgres_changes` subscriptions exist.

Guests are not a count field on a member's signup row — each guest gets its own separate `signups` row with `is_guest_entry: true` and `sponsor_golfer_id` set to the sponsoring member's `golfer_id`.

---

## Key Components & Responsibilities

### App.tsx
- Owns all global state
- Manages polling refresh loops and initial data fetches
- Renders the shell: `AppHeader` + `BottomNav` + tab content
- Handles admin PIN validation (unlock persisted in localStorage `ss_admin`,
  restored on boot; survives PWA force-quit until explicit logout)
- Member identity: localStorage `ss_member` (golfer_id) picked via first-run
  modal or Settings — personalization only (header greeting + `.me-row`
  highlights on leaderboard/RSVP rows), not authentication

Note: the `.golden-hour` class is applied inside `LeaderboardTab.tsx` (Fri/Sat
4–8pm via `Intl` in `America/Los_Angeles`), not in App.tsx — it only tints the
leaderboard subtree today.

### BottomNav (components/nav/)
- 6-tab navigation with floating green-ball indicator
- Filleted bowl cutout SVG below active tab
- Spring animation: cubic-bezier on indicator position

### LeaderboardTab (tabs/leaderboard/)
- Displays weekly event results + season standings
- Calculates paid positions, skins, earnings from props
- `UpcomingCourseCard` — next event preview with weather
- `FieldStrengthMeter` — bar showing field handicap distribution

### RSVPTab (tabs/rsvp/)
- Shows attendance for next event
- Admin mode: pairing controls + tee time assignment
- Calls `runPairingEngine()` from golfMath.ts

### ScoreEntryTab (tabs/scoreentry/)
- Hole-by-hole entry grid
- Writes to `hole_scores` table per keystroke/confirm
- Shows live net score and Stableford points per hole
- Side-game lens on the Score Sheet (lib/sideGames.ts): pill toggle swaps the
  table to "Nines" (exactly 3 started scorers) or "Sixes" (exactly 4). Pure
  derived display — handicaps reduced to the group's low man, nets recomputed
  via calcHoleNetScore; local state only, nothing persisted. Sixes pairing
  picks (player 0's partner per 6-hole stretch) default to the standard
  AB/CD → AC/BD → AD/BC rotation; skins carry across segments, forfeited after 18.

### AnalyticsTab (tabs/analytics/)
- Season overview: avg points, best round, earnings
- `ScatterChart` — handicap vs points scatter
- `ScoringFingerprintRadar` — per-player performance radar (pure SVG, not Chart.js)
- `ChampionsView` — historical event winners

### OddsTab (tabs/odds/)
- Pre-event win probability display
- Reads from `event_odds` table via `useEventOdds()` hook
- Falls back to client-side `calcFieldOdds()` Monte Carlo
- `TonyInsight` — Gemini AI commentary on matchups

### AdminTab (tabs/admin/)
- PIN-gated (checked in App.tsx before render)
- `EventCreator` — create/edit events
- `PairingDashboard` — drag-and-drop tee time assignment
- `HandicapManager` — update golfer handicap indices
- `ScoreCorrection` — retroactively fix scores
- `MessageBlast` — Web Push to all subscribed golfers
- `GolferRoster` — add/remove players

---

## Golf Math Engine (lib/golfMath.ts)

Pure functions only — no side effects, no Supabase calls.

```
calcPlayingHandicap(handicapIndex, slope, rating, par) → playing handicap
calcHoleNetScore(gross, strokesReceived) → net score
calcStablefordPoints(netScore, par) → 0-4 points
calcHoleScores(holeScores[], playingHandicap, courseHoles[]) → per-hole breakdown
runPairingEngine(golfers[], teeTimes[], sponsorGroups[]) → group assignments
assignLateAdd(golfer, existingGroups[]) → updated groups
calcSeasonLeaderData(events[], leaderboard[]) → season standings + payouts
```

Stableford scale: eagle=4, birdie=3, par=2, bogey=1, double+=0.
Payout: 1st (solo) = 2/3 pot; 1st (tied) = pot/n; 2nd = 1/3 pot (only if 1st is solo).

---

## Odds System (lib/monteCarlo.ts + useEventOdds.ts)

1. **Primary:** `useEventOdds()` polls `event_odds` table (pre-computed server-side)
2. **Fallback:** `calcFieldOdds()` — client-side Monte Carlo (10k+ simulations)
   - Samples each golfer's historical score distribution
   - Returns: win%, top3%, top5%, American odds, confidence intervals

---

## Weather System (hooks/useWeather.ts + useLiveWeather.ts)

- `useWeather(courseName, date)` — fetches Open-Meteo forecast for course coordinates
  - Uses `courseNameUtils.ts` fuzzy match to map course name → lat/lon
  - Returns hourly forecast for event day
- `useLiveWeather(lat, lon)` — current conditions polling (30s interval)
- `WeatherModal` — expandable card with hourly forecast
- `WindParticles` — canvas animation overlay showing wind speed/direction

---

## CSS Architecture

All styles in `src/index.css` and `src/App.css`.

```css
:root {
  /* Palette */
  --green-900: #1a3a2a;
  --green-700: #2d6a4f;
  --gold-500: #d4a017;
  --earth-800: #3d2b1f;
  /* Layout */
  --bottom-nav-height: 72px;
  --safe-area-bottom: env(safe-area-inset-bottom);
}

.golden-hour { /* Fri/Sat 4-8pm PST color shift */ }
.app-shell { display: flex; flex-direction: column; height: 100dvh; }
.main-content { flex: 1; overflow-y: auto; }
```

Fonts: DM Sans (body), DM Serif Display (headings) — Google Fonts.
No CSS framework (no Tailwind, no Bootstrap).

---

## PWA & Mobile

- `public/manifest.json` — standalone display mode, theme-color green
- Service worker: generated at build time by `vite-plugin-pwa` (Workbox
  `generateSW`, `registerType: autoUpdate`, auto-registered on every load).
  Precaches the app shell; runtime caches: Supabase `/rest/v1` GETs
  (NetworkFirst), Supabase Storage images (CacheFirst), Google Fonts
  (CacheFirst), Open-Meteo (NetworkFirst). Push handlers live in
  `public/push-handlers.js` and are merged in via `importScripts`.
- Offline writes: `src/lib/writeOutbox.ts` is an IndexedDB outbox. The REST
  wrapper queues idempotent writes (PATCH / DELETE / upsert) on network
  failure and replays FIFO on `online`/`visibilitychange`/30s interval/boot.
  Inserts are NOT queued (callers need the returned id) — they fail fast and
  surface via `reportWriteError` → App's error toast. A pending-sync pill in
  the App shell shows the queued count / offline state.
  Staleness protection (2026-07-12): same-row PATCH dedupe merges bodies per
  column (newest wins per column, so attending vs early_tee_request writes to
  one signup can't drop each other); a write that succeeds directly supersedes
  queued ops for the same row (just-written columns stripped from queued
  PATCH bodies, all ops voided on DELETE); replay discards ops older than a
  per-table max age (event_signups 6h, default 48h) with a toast; write
  fetches use `keepalive: true` so iOS can't abort them at app-close. App's
  `dbUpsertSignup` PATCHes only the columns that changed (prev row passed by
  `setSignupsDB`) so a device with stale state never echoes a full row over
  concurrent edits from other sessions.
- `public/apple-touch-icon.png` — iOS home screen
- `index.html` — inline script detects `standalone` mode → adds `is-pwa` class to `<html>`
- Safe area insets handled via CSS env() vars
- LAN-accessible dev server for testing on physical phones (`host: true` in vite.config.ts)
