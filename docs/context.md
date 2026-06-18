# Working Context

_Last updated: 2026-06-18. Update this file when starting/finishing features or discovering bugs._

---

## Recent Work (last 5 commits)

| Commit | Summary |
|--------|---------|
| `1996dd0` | Upcoming leaderboard formatting and fixes |
| `0d8f284` | Nav fix |
| `793209c` | Nav fix leaderboard bug |
| `807f9be` | Nav alignment |
| `247f2e2` | Splash screen bug |

Active focus: leaderboard display, navigation chrome, splash screen behavior.

---

## Known Issues / Bugs

- Nav indicator alignment was recently fixed (3 commits) — treat nav layout as potentially fragile
- Leaderboard formatting was actively changed in last commit — verify display before touching

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
