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
(4) 2026-07-12: RSVP "EARLY badge resurrection" fix (removed early-tee request came back
after reload — root cause: stale queued outbox op replaying over a newer successful write,
plus same-row PATCH dedupe dropping the other column's intent). Changes: outbox same-row
PATCH dedupe now MERGES bodies per column instead of replacing; a successful direct
PATCH/DELETE/UPSERT supersedes queued ops for the same row (per-column strip, full void on
DELETE); replay max-age (event_signups 6h, other tables 48h) discards stale ops with a toast;
all write fetches use keepalive so iOS can't abort them at app-close; dbUpsertSignup PATCHes
only changed columns (setSignupsDB passes the prev row) so a stale device can't echo a whole
row over concurrent edits. Behavioral test of all scenarios passed (scratchpad harness, in-memory
outbox + mocked fetch). Note: RSVPTab intentionally still receives setSignupsDB — PairingPanel's
generate/move/swap rely on its diff-writes for persistence.
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

- IN PROGRESS 2026-07-13: Event Highlights + Auto Recap (admin-gated, flag
  `HIGHLIGHTS_AUDIENCE` in src/tabs/leaderboard/highlights/highlightsShared.ts).
  Story rail on the completed-event detail overlay (between skins card and
  leaderboard) + full-screen story viewer mixing auto data beats (win-prob
  replay selector in src/lib/recapEngine.ts, adapted from WinProbabilityChart's
  checkpoint/simulate math) with member photo/video moments. New tables:
  highlights / highlight_likes / highlight_comments / story_beats_history
  (migration supabase/migrations/20260713_highlights.sql — NOT YET APPLIED).
  Media on Cloudflare R2 via presigned PUTs from the new r2-presign Edge
  Function (NOT YET DEPLOYED; operator steps in docs/highlights-r2-setup.md).
  Feature CSS appended to the CSS const in App.tsx (rail .story/.ring, viewer
  .v-*/.beat*, sheets, add flow). Members see zero change until the flag flips
  to 'all'. Remaining before flipping: apply migration, create R2 bucket +
  secrets + deploy function, verify R2 round-trip on a phone.
  UPDATE 2026-07-13 (same day): beat selection rebuilt as an independent
  DETECTOR CATALOG (14 angles: three_way/duel/wire_to_wire/pace_setter openings;
  charge/collapse/hold/grinder/wildcard/tough_hole this-event middles;
  nemesis/redemption/out_of_character/rivalry cross-event middles; final) with
  a weighted composer (strength x surprise x recency x protagonist penalties).
  Cross-event history built client-side from leaderboard/events/holeScores
  props (buildPlayerHistories). New viz payloads grind/fieldStat/h2h/histBars
  render in the viewer. Acceptance gate: tests/recapEngine.backtest.test.ts
  (run: node --test tests/recapEngine.backtest.test.ts) replays the last 7
  real hole-by-hole events from tests/fixtures/recapBacktest.json -- asserts
  angle variety, no repeating skeleton, spotlight rotation, grammar (verbs,
  no gendered pronouns), determinism. Beat cache key bumped to hl_beats_v2_.
  Known limitation: simulate() uses one fixed hole-outcome distribution for
  all players; per-player distributions are the next lever if beats feel noisy.
  UPDATE 2026-07-15 (Handoff #3, "recap visual language"): engine + viewer pass.
  Engine (src/lib/recapEngine.ts): Monte Carlo now SEEDED on event_id
  (mulberry32) so a given event yields identical beats forever; beat valence
  keys on Stableford POINTS not gross-par (DataBeat.score gained `points`);
  charge detector requires protagonist merit (>=2 pts on the anchor hole, run
  variant "The Run" when a >=3-hole >=2pt stretch exists); collapse requires
  <=1 pt; all odds-speak removed from copy (win-prob stays internal; users see
  points + position via new ptsPanel/streak/scoreRow/scorecard/fieldBars/
  weekBars payloads; odds/swing payloads retired); beats carry heroLabel/
  eyebrow/holeMeta (kicker/title mapped for compat); nemesis per-hole history
  is now SAME-COURSE only (buildPlayerHistories holeStatsEventIds) while
  season baselines stay cross-course; hidden angles filter PRE-composition.
  Cache key hl_beats_v3_. Backtest rewritten to run the real seeded path
  twice + new asserts (no odds-speak, charge merit, par consistency) -- 11/11.
  Viewer (HighlightsViewer.tsx) rebuilt to the approved mockup
  (recap-visual-language.html): blurred scenic bg + mood tints, right-aligned
  hero label over the focus .shot card, animated hole number, glass panels,
  real .lb-* finalboard w/ bottom-up reveal + leader shine (scoped
  .finalboard), anchor-driven tracers (normalized anchors on hole_images
  view_type 'hole'|'green'; green view = OUTCOME ONLY, never putt counts;
  fixed-arc fallback when no anchors). Pressing down pauses IMMEDIATELY
  (.viewer.paused freezes all CSS animation, video pauses too) with NO pause
  indicator; release always resumes, and a press >180ms counts as a hold so
  its release never navigates. Left/right-third tap zones navigate (centre
  tap does nothing; nav arrows and the pause pill were removed at user
  request 2026-07-15); topbar dots/close icons have no background circle;
  iOS long-press callout suppressed. Dots menu: admin hide-beat (updates
  story_beats_history.hidden, busts cache, recomposes so the next-best
  candidate fills the slot) + edit-caption (caption_override); human cards get
  owner/admin edit + delete (soft-hide). Yardage in hole meta follows the
  protagonist's tee (event_signups.tee_box_course_id) -> most common tee ->
  first course row. Admin anchor authoring tool: Admin > Courses > hole-images
  grid, the crosshair button (src/tabs/admin/AnchorTool.tsx; shared math in
  highlights/tracerMath.ts + TracerSvg.tsx). NEW MIGRATION NOT YET APPLIED:
  supabase/migrations/20260715_highlights_visuals.sql (hole_images.view_type/
  anchors; story_beats_history.hidden/caption_override + anon update grant).
  Until applied, hide/edit-caption writes fail soft (reportWriteError toast)
  and anchors cannot be saved; everything else works. Verified via seeded
  backtest + read-only Playwright smoke (hold-to-pause, tap zones, dots menu,
  member-gate isolation: zero highlights API calls for non-admin).
  UPDATE 2026-07-15 (same day, "late-round bias" pass): beat SELECTION
  reworked -- no viewer/CSS changes, all new beats reuse existing payloads.
  Governing principle (comment block in recapEngine.ts): narrative weight AT
  THE MOMENT != contribution to the final result; win-prob deltas grow
  ~1/sqrt(holesRemaining) so ranking on them selects "the latest hole".
  Merit beats (charge/hold/fast_start/fade) now rank on FIELD-RELATIVE
  Stableford points (holeMerit/spanMerit vs ctx.fieldMeanAt) -- position-
  independent by construction; collapse stays the ONE odds-driven beat (the
  turning point legitimately skews late). Openings are DETECTED in holes 3-9
  (three_way: bunched-count x depth; duel: points separation of a top pair;
  pace_setter: peak early margin; wire_to_wire: permanent-lead onset <= 4 +
  late margin never below 1, else the caption's "never threatened" would
  lie). hold un-gated from h>12 (led -> lead lost -> >=2pt answer restoring
  margin). New detectors: fast_start (burst merit over holes 1-5, ranked on
  the burst NEVER on whether it lasted; streak payload), fade (top-2 at an
  early/mid checkpoint -> finished >=4 spots back outside top 3; ranked on
  earlyStanding x positionsLost, explicitly not outcome impact; two-col
  ptsPanel), the_turn (hole-9 state, low base strength, middle filler).
  Composer: soft spread constraint (x0.55 for an occupied round-third
  1-6/7-12/13-18, x0.75 within 4 holes of a chosen beat -- multipliers,
  never blocks), iterative weighted pick replaces the static two-pass sort,
  and the opening's protagonist counts against middle pass-1 freshness (no
  more "Mark's hot start" told twice). grinder loosened (zero blanks + <=1
  net birdie; the all-1s-and-2s gate never fired on real data), rivalry
  loosened (mean gap <= 2.5, crossings >= 2). Long-run streak strips cap
  their context so they stay phone-width. Beat cache key bumped to
  hl_beats_v4_. Backtest: 4 new distribution asserts (opening variety,
  round coverage >= 2 thirds majority, front-nine merit reachability,
  7-13 dead-zone) + per-third histogram in the dump; 15/15 pass. Result on
  the last 7 real events: openings 9,6,8,3,7,4,7 (was 6x7); thirds histogram
  5/7/4 (was ~0 outside the last third for merit beats); fade/fast_start/
  rivalry fire on real data. duel/wire/grinder verified genuinely absent in
  this 7-event window (conditions checked directly against the fixture),
  not threshold-starved.

- DONE 2026-07-08: Member identity + persistent logins. Admin unlock moved from
  sessionStorage to localStorage (`ss_admin`) and auto-restored on boot, so it
  survives an iOS force-quit; cleared only via the profile-icon logout. New
  member identity (personalization only, no auth): first-run "Who are you?"
  picker in App.tsx (localStorage `ss_member` + `ss_member_skip` for the
  "just browsing" dismissal), changeable via the new Your Profile card in
  SettingsTab. The picker auto-shows on load only in the installed PWA
  (html.is-pwa from index.html's standalone detection); in a plain mobile
  browser (e.g. emailed links) it waits until the Settings tab is opened.
  EventAlertBanner (leaderboard sign-up reminder, Mon–Wed) hides for an
  identified member who has already answered In OR Out for the upcoming
  event; unidentified users and Unconfirmed members still see it. Dismissal
  (swipe or ×) is per-event and permanent — localStorage
  `ss_alert_dismissed_event` stores the event_id, self-managed inside
  EventAlertBanner (App's old midnight-expiry sessionStorage flag is gone);
  the banner returns when a new event becomes the target.
  Drives a time-of-day greeting in AppHeader
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
