# CLAUDE.md — Saturday School Golf League App

> **INSTRUCTIONS FOR CLAUDE CODE:** At the start of every new chat, read this file first, then `docs/architecture.md` and `docs/context.md`. Do not read source files until you've read all three. Derive current task context from `docs/context.md` before asking clarifying questions.

---

## Project Overview

Saturday School is a mobile-first PWA for managing a Stableford golf league. It handles events, RSVPs, tee-time pairings, live score entry, leaderboards, season analytics, and pre-event odds. Real-time data via Supabase; designed to run on golfers' phones as an installed PWA.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 (Oxc transforms) |
| Backend/DB | Supabase (PostgreSQL + real-time WebSockets) |
| Charts | Chart.js 4 |
| Icons | lucide-react |
| Styling | Pure CSS (CSS vars, no CSS-in-JS library) |
| AI | Google Gemini API (VITE_GEMINI_KEY) |
| Calendar | Google Calendar API (VITE_GCAPI_KEY) |
| Push | Web Push / VAPID |

---

## Directory Structure

```
src/
  App.tsx               # 2000-line monolith: global state, Supabase subs, tab routing
  main.tsx              # React 19 createRoot entry point
  supabaseClient.ts     # Supabase client init (URL + anon key from .env)
  useEventOdds.ts       # Hook: polls event_odds table for pre-computed odds
  index.css / App.css   # All styles — CSS vars, animations, theming
  assets/               # Static images (logos, backgrounds)

  components/
    common/             # SubTabPanel, ToggleGroup, CountUp, etc.
    charts/             # ScoringFingerprintRadar (Chart.js radar)
    nav/                # AppHeader, BottomNav (6-tab floating ball nav)
    weather/            # WeatherModal, WindParticles, weatherUtils
    EventAlertBanner.tsx

  tabs/
    leaderboard/        # Weekly event results, skins, earnings
    rsvp/               # Attendance + admin pairings view
    scoreentry/         # Hole-by-hole live score entry
    analytics/          # Season stats, scatter/radar charts, champions
    odds/               # Monte Carlo win % + Tony insight AI feature
    admin/              # PIN-gated: events, handicaps, courses, messaging, roster
    settings/           # User prefs, push notification opt-in

  hooks/
    useLiveWeather.ts   # Real-time weather during event
    useWeather.ts       # Forecast by course + date
    useEdgeElastic.ts   # iOS rubber-band scroll effect
    usePullToRefresh.ts # Drag-to-refresh gesture

  lib/
    golfMath.ts         # All handicap/Stableford/pairing math (pure functions)
    monteCarlo.ts       # Client-side odds simulation
    seasonStats.ts      # Season aggregate calculations
    scoringFingerprint.ts # Per-player performance radar data
    formatters.ts       # Date/name formatting utils
    courseNameUtils.ts  # Fuzzy course name matching

docs/
  architecture.md       # Data flow, Supabase schema, component responsibilities
  context.md            # Active bugs, in-progress features, hot files
```

---

## Run / Build / Deploy

```bash
npm run dev       # Vite dev server: http://localhost:5173 (LAN-accessible via host: true)
npm run build     # tsc -b && vite build → dist/
npm run preview   # Serve dist/ locally
npm run lint      # ESLint check
```

Deploy: static `dist/` to any CDN (Vercel/Netlify/S3). Service worker (`public/sw.js`) enables offline mode.

---

## Key Conventions & Gotchas

- **No router.** Tab state is manual (`useState` in App.tsx). Don't add react-router without discussion.
- **No global state library.** All state lives in App.tsx and is passed as props. No Redux/Zustand/Context.
- **TypeScript is loose** (`strict: false`, `noImplicitAny: false`). Don't add aggressive type assertions.
- **Admin access** is PIN-gated via `VITE_ADMIN_PINS` env var (currently `0602`). Not OAuth.
- **Golden Hour Mode:** CSS class `.golden-hour` applied Fri/Sat 4–8pm PST for color shift. Time-based in App.tsx.
- **.env is committed** with real keys (Supabase, Gemini, VAPID). Don't flag as a security issue — intentional for this project.
- **Supabase real-time** subscriptions are set up in App.tsx `useEffect`. DB changes auto-refresh state.
- **Payout logic:** $20/golfer buy-in. 1st solo = 2/3 pot; 1st tied = full pot split; 2nd only paid when 1st is solo (1/3 pot).
- **Stableford scoring:** 2 pts = par, 3 = birdie, 4 = eagle, 1 = bogey, 0 = double bogey or worse.
- **App.tsx is ~2000 lines** — normal for this project. Don't refactor it unless specifically asked.
