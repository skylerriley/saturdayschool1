# Architecture Reference

## Data Flow

```
Supabase PostgreSQL
  │
  ├─(real-time WS)──> App.tsx useEffect subscriptions
  │                       │
  │                       └─> useState (golfers, events, signups, leaderboard, holeScores, courses)
  │                               │
  │                               └─(props)──> Tab components ──(callbacks)──> Supabase upsert/insert
  │
  └─(one-time fetch)──> initial data load on mount
```

No Context API, no Redux. All Supabase subscriptions are in App.tsx. Tabs receive data + setter callbacks as props.

---

## Supabase Tables (inferred from usage)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `golfers` | id, name, handicap_index, phone | Player roster |
| `events` | id, date, course_id, status | Scheduled rounds |
| `signups` | event_id, golfer_id, paid, tee_time, group_num | RSVP + pairings |
| `hole_scores` | event_id, golfer_id, hole, gross_score | Per-hole scoring |
| `leaderboard` | event_id, golfer_id, points, gross, net | Computed results |
| `courses` | id, name, slope, rating, par, holes[] | Course database |
| `event_odds` | event_id, golfer_id, win_pct, top3_pct | Pre-computed odds |

Real-time subscriptions: `postgres_changes` on `signups`, `hole_scores`, `leaderboard`.

---

## Key Components & Responsibilities

### App.tsx
- Owns all global state
- Manages Supabase subscriptions and initial data fetches
- Renders the shell: `AppHeader` + `BottomNav` + tab content
- Handles admin PIN validation
- Applies `.golden-hour` class based on time

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

### AnalyticsTab (tabs/analytics/)
- Season overview: avg points, best round, earnings
- `ScatterChart` — handicap vs points scatter
- `ScoringFingerprintRadar` — per-player performance radar
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
- `public/sw.js` — minimal service worker (cache-first for static assets)
- `public/apple-touch-icon.png` — iOS home screen
- `index.html` — inline script detects `standalone` mode → adds `is-pwa` class to `<html>`
- Safe area insets handled via CSS env() vars
- LAN-accessible dev server for testing on physical phones (`host: true` in vite.config.ts)
