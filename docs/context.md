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
  UPDATE 2026-07-16 (Handoff #5, "repetition / notation / labels"): beat
  SELECTION + one CSS fix; NO viewer/tracer changes. (1) Anti-repeat: the
  pool was too thin for soft penalties to work (wildcard recurred, dead
  detectors starved competition). Revived DEAD detectors by tuning to the
  real distribution: grinder was "birdie-free top-3" (mythical -- every real
  top-3 card has 7+ net birdies) -> now "few BLOWUPS" (<=1 blank, birdies<=pars);
  duel g23 relaxed 3->2 (early Stableford leaders rarely open a 3pt gap to
  3rd by hole 9). Added HARD COOLDOWNS in composeBeats (blocks, not
  multipliers): (angle,protagonist,hole) 4 events, (angle,protagonist) 3
  events -- nemesis is structurally sticky (worst hole is stable) so a soft
  decay could never dislodge it. Steepened angle decay 0.6^n->0.45^n over a
  6-event window (was 4). Added a DIVERSITY FLOOR: past the first middle beat,
  a candidate must clear a recency-decayed weight floor or we emit FEWER
  beats (an honest 3-beat recap beats a 5-beat one that repeats last week).
  Threads `hole` + `eventsAgo` through BeatHistoryRow; module persists
  b.hole to story_beats_history (new col via migration 20260716_beat_hole.sql,
  additive, null=whole-round); recentEventIds widened 4->6 in LeaderboardTab.
  (2) DATA-HONESTY: .sr-c.hi emphasised the glyph with border-radius:50% + a
  gold ring -- a CIRCLE MEANS BIRDIE in golf notation, so a par rendered as a
  birdie. Moved emphasis to the CELL (bg/border/scale), added a durable CSS
  rule comment: .sc-* notation is the ONLY thing allowed to encode
  score-to-par; emphasis never adds shape to a glyph. Audited st-c.on /
  sccard sc-cell / vb.hi / st-win -- all clean (scale/bg/window only).
  (3) finalStandings now full "First Last" (was "Joe F"); the board uses the
  ellipsising .lb-name-main cell. (4) Chart labels are real event dates
  ("May 30", "Jun 6") not "Wk -N" offsets -- threaded recentDates /
  holeDatesByEvent through buildPlayerHistories + a shortDate() helper.
  (5) TIE-AWARE copy: added standingPhrase()/leadByPhrase() and routed all
  position claims (openings, fade, fast_start, final title+caption) through
  them -- "XYZ has the lead" during a 4-way tie was a false statement, not a
  grammar nit. Backtest: +5 asserts (no-exact-repeats, angle-rotation <=4/7,
  detector-liveness, tie-safety, date-labels) + per-angle frequency table;
  20/20 pass. Fixed pre-existing "blowoutss" double-plural in wildcard.
  Result: every registered detector fires (the_turn exempt as starvation
  filler); no angle > 3/7 events; openings 9,3,8,8,6,4,6.
  UPDATE 2026-07-16 (Handoff #6, "scratch-golf assumptions + history rebuild").
  (A) DETERMINISM -- the big one. story_beats_history was written ON READ
  (HighlightsModule persisted surfaced beats), so the story was a side effect
  of who viewed what in which order. Opening the newest event first finds no
  rows for events N-1..N-6 => no cooldowns => every event composed as if it
  were the first ever played. MEASURED on the real fixture: 6/7 events told a
  different story by viewing order, wildcard fired 7/7 (vs 2/7 chronological),
  and only 10 of 17 angles ever surfaced. This is why "wildcard recurs" and
  "Joe's nemesis 3 weeks running" were reported while the backtest passed --
  the backtest replays chronologically, i.e. only ever tests the ideal case.
  FIX: reads are now PURE (write removed; invariant comment in the effect).
  New src/lib/rebuildBeatHistory.ts is the SOLE author: chronological replay,
  idempotent (seeded MC), preserves admin hidden/caption_override across the
  wipe, applies carried hides DURING composition. Run from Admin > Events
  ("Rebuild Beat History", client-side, ~hundreds of ms at 25 events/yr) and
  automatically on ScoreEntry finalize. New src/lib/buildBeatsInput.ts is
  shared by BOTH the read path and the rebuild so they cannot drift (it also
  fixes the history fetch window, which used the globally-newest events rather
  than the ones preceding THIS event -- wrong for mid-season). Cache key ->
  hl_beats_v5_ via BEATS_CACHE_VERSION in buildBeatsInput. Verified: 0/7
  events differ across forward/reverse/random read order; reads leave history
  byte-identical. NOT frozen -- while HIGHLIGHTS_AUDIENCE='admin' beats stay
  live/re-derivable so engine improvements improve past recaps; revisit
  immutability when flipping to 'all'.
  (B) SCRATCH-GOLF AUDIT (same class as the tracer-valence and grinder bugs:
  gross where net belongs, absolute where relative belongs). NEMESIS was
  ranking a player's worst hole by ABSOLUTE gross average -- that just
  re-finds the hardest hole on the course, which is everyone's worst hole
  permanently (probed: hole 14 was the "nemesis" of 2/7 players in one event;
  18 recurred across three). Now field- AND baseline-relative in POINTS:
  deficit = (player mean pts on hole) - (field mean pts on hole) - (player
  overall mean - field overall mean), min 3 rounds on the hole + 6 field
  samples, needs <= -0.6. New buildFieldHoleBaseline() + ctx.fieldBaseline.
  Caption now states the personal gap, not the absolute average. GRINDER now
  ranks on VARIANCE (per-hole points stddev < 0.8x field median) + birdies <=
  pars -- "birdies <= pars" alone let a 7-birdie card be called "no
  fireworks". DUEL was probed and rebuilt: a 3+ point gap to third never
  happens over holes 3-9 ([1,0,1,2,1,1,2]) and a 3-cushion two-horse race
  never survives 2 holes; so it is now a whole-round MIDDLE beat requiring a
  2-point cushion SUSTAINED >= 4 holes (duration is the evidence the gap is
  real). Fires 1/7, honestly. COLLAPSE is exempt from the spread penalty --
  the turning point is allowed to be late because it is true.
  (C) Backtest 20 -> 26 tests: viewing-order independence (forward/reverse/
  random reads identical), reads-do-not-write, rebuild determinism, nemesis-
  is-personal (never shadows tough_hole, <=2 protagonists per hole), grinder-
  low-variance, turning-point-truth (argmax |delta| within its merit gate).
  Docs: docs/highlights-r2-setup.md section 5b documents when to rebuild.

  UPDATE 2026-07-16 (Handoff #7, "rare fireworks: gross eagle or better"). One
  new detector: detectFireworks in recapEngine.ts emits ace / albatross / eagle
  from GROSS score (gross === 1 => ace; gross - par === -3 => albatross; -2 =>
  eagle), classified by the RAREST applicable label (an ace on a par 3 is an
  ace, not an eagle). THIS IS THE DELIBERATE GROSS EXCEPTION to the net-points
  valence rule -- a gross eagle is a real achievement regardless of handicap,
  where a NET eagle is routine here; the exception is commented prominently at
  the detector so a future "consistency" pass does not convert it to net and
  delete the feature. It is a CERTAINTY, not a competition: detected OUTSIDE the
  DETECTORS pool and appended additively in composeBeats, so it is exempt from
  every anti-repeat rule (cooldowns, angle decay, protagonist rotation, the
  spread/thirds constraint, the diversity floor) -- an eagle on the same hole
  three weeks running still fires. Additive means it takes a slot ON TOP of the
  arc (an eagle event may emit 6-7 beats) and never displaces a middle. Capped
  at 2 per event (highest tier first, then earliest hole) so a freak day cannot
  flood the recap. Admin hides still apply. Rarity claims are data-honest: the
  only claim we can PROVE is "first ever here" (from same-course per-hole gross
  history); a season-wide "first this season" is NOT asserted (we do not carry
  the all-hole gross history to prove it). Real fixture: event 303 has Greg's
  gross eagle on 16 (par 5) -- it surfaces alongside the full arc, displacing
  nothing. Backtest 26 -> 31 tests: always-fires (real + synthetic), cooldown
  exemption, tier classification, cap, additive (arc unchanged with/without the
  eagle); fireworks angles exempted from the rotation and liveness asserts (0
  aces/albatrosses in the fixture is not a dead detector). No viewer/CSS work;
  reuses the existing score payload (tracer valence is points-based, eagle = 4
  pts, so the best arc already draws). Milestone gold-badge visual deferred
  (asset-library follow-up, out of scope). BEATS_CACHE_VERSION bumped v5 -> v6
  (new detector changes output; other devices must drop cached beats), and a
  history rebuild is required after deploy.

  UPDATE 2026-07-16 (Handoff #8, "chronological ordering: no forced opening").
  BUG: the race-state beat (three_way/duel/pace_setter/wire_to_wire) was always
  emitted first regardless of hole, so a recap could go "standings through 9"
  -> "eagle on 4" -> "run over 5-8" and jump backwards. Handoff #4 made the
  opening DETECTED across holes 3-9, which exposed it. ROOT CAUSE was in TWO
  places: composeBeats assembled in slot order (opening pushed first), and
  HighlightsModule's watch-model gave every opening the hardcoded sort key
  hole=0 ("cold open, before hole 1") so watchOrderCompare pinned it first and
  floated whole-round (hole:null) beats to the end. FIX: every beat now carries
  resolutionHole -- the hole where its story RESOLVES -- and both the composer
  and the module sort on it. Single-hole beats resolve at their hole; span
  beats at their END (a run over 5-8 -> 8, fast_start -> burst end, fade/
  wildcard/grinder/rivalry/redemption/out_of_character whole-round -> 18 so
  they land by the finish); the opening -> its throughHole. resolutionHoleFor()
  in recapEngine derives it (endHole added to charge/fast_start evidence, duel
  already carried throughHole). The composer's forced-first slice is GONE -- the
  opening goes through the same sort; watchOrderCompare is UNTOUCHED (the module
  just feeds it resolutionHole as the hole key, with a throughHole/hole
  fallback for pre-v7 cached beats). Opening SLOT guarantee kept: exactly one
  throughHole-bearing race-state beat per recap, only its forced POSITION
  removed. Position-aware labels via relabelRaceState(): "The Opening" and
  earliness copy ("takes shape"/"opening stretch"/"finding its footing") only
  when the beat is chronologically first; otherwise three_way gets a neutral
  "A Three-Way Race"/"Where It Stands" label + rewritten copy. pace_setter/
  wire_to_wire keep their labels (earliness is baked into the ANGLE meaning,
  and "one clear early leader" stays true even after an eagle on 4). Verified
  on the exact bug shape: event 302 now reads fast_start(3) -> three_way(8) ->
  fade(18) -> duel(18), no backwards jump. Backtest 31 -> 35 tests: monotonic
  chronology (the assert that would have caught it), span resolution, opening-
  slot guaranteed, label truth (no "The Opening"/earliness off the front).
  BEATS_CACHE_VERSION bumped v6 -> v7; history rebuild required after deploy.

  UPDATE 2026-07-16 (Handoff #9, "caption architecture, layout bugs, copy").
  1 CAPTIONS SELF-CONTAINED: the visual hierarchy makes the caption primary
  (~24px under the graphic) and the eyebrow a 15px aside the eye skips, so every
  caption now states who+what+so-what alone and never leans on the eyebrow. The
  final beat was the worst case ("A tie for second sits just behind" named no
  winner) -- rewritten to always name the champion + margin, with 3 structural
  variants. Rule commented at the Phrasing header in recapEngine.
  2 CAPTION LAYOUT (App.tsx viewer CSS): .beat-mid (flex:1,min-height:0,
  overflow:hidden) and .beat-auto (flex:0 0 auto) are siblings that cannot
  overlap the footer; .beat-cap gets 3px side padding + length-bucketed font
  (cap-xl/lg/md/sm = 24/21/18/16px picked by capSizeClass in the viewer) so a
  long caption shrinks instead of running on. ~140-char copy budget enforced by
  a backtest assert (caught nemesis at 177 -> rewritten to 3 shorter variants).
  3 tough_hole BARS RENDERED EMPTY: root cause was @keyframes hbFill animating
  to width:var(--w) (custom-property-in-keyframe, fragile on iOS WebKit). Fixed:
  .hb-f gets its final width INLINE and animates transform:scaleX(0->1) from the
  left; added a non-finite-value guard (renders 0, warns, never NaN%). vbars
  audited -- already scaleY off the correct key, no change.
  4 SCORECARD: grinder/wildcard already render standalone (hole==null => no
  shot); .sccard.stand bumped to bigger cells (34px)/gap/padding with a divider
  between the front/back nine. .sc-* notation shapes untouched (the standing
  data-honesty rule).
  5 STANDINGS BEATS = REAL LEADERBOARD: race-state (three_way/pace_setter/
  wire_to_wire) + the_turn + final now render the .lb-* board floating over the
  blurred photo (no decorative hole image -- a standings beat has no shot to
  trace), via a shared StandingsBoard renderer. New engine payload beat.standings
  {label,thru,isFinal,rows} carries the WHOLE tie-aware field (buildStandingsBoard
  + input.fullStandings from buildBeatsInput). THRU column reuses .lb-thru-*
  (checkpoint hole on standings beats, "F" on final). Gentle translateY
  auto-scroll (sbScroll keyframe, ~46px/sec, completes inside the beat, holds top
  + bottom), capped at 12 rows + "+N more", frozen by .paused, static under
  reduced motion. Final keeps its bottom-up reveal + leader shine (scoped to
  .is-final), scroll sequenced after. Money column deferred (points only).
  6 COPY VARIETY: multi-shape pick() caption pools added to final/nemesis/
  grinder/wildcard/fade (3 structural shapes each: lead with number / name /
  consequence); others carry varied eyebrows + movement clauses. New asserts:
  caption-self-contained (protagonist named), char-budget (<=160), cross-event
  variety (an angle firing 3+ times is not one fixed shape). Gemini rephrase
  noted as a rebuild-time seam, not wired.
  7 Migrations made idempotent last turn; setup doc 5 documents the 4-file
  order + re-runnability + the required DELETE grant.
  Backtest 35 -> 38 tests, all green; typecheck/lint/build clean.
  BEATS_CACHE_VERSION bumped v7 -> v8; history rebuild required after deploy.

  UPDATE 2026-07-16 (Handoff #10, "standings truth, bar bug, date identity").
  1 P0 STANDINGS TRUTH: a checkpoint standings beat showed each golfer's FINAL
  points under a "THRU 6" label -- so the positions were final too, i.e. the
  finishing order relabelled. Root cause: buildStandingsBoard sourced
  input.fullStandings (the final board). Rewritten to take ctx and build from
  ctx.totalsSeries[i][hole] (cumulative through the checkpoint) with tie-aware
  positions derived from THOSE totals; the final beat is the only caller that
  reads ctx.totals. Assert: a checkpoint board equals cumulative-through-N, at
  least one golfer differs from their final total, positions derive from the
  same series. (input.fullStandings now unused by the board.)
  2 P0 tough_hole BARS EMPTY -- the Handoff #9 scaleX/keyframe fix was NOT the
  cause. Real cause: .hb-f is a <span> with no display, so it was inline, and
  WIDTH IS IGNORED ON INLINE BOXES -- the inline width:X% did nothing and the
  fill had zero width (numbers printed from a separate span, bars empty: the
  exact symptom). Fix: .hb-f{display:block}. Keys were already {label,value,
  color} (not the l/v/c mismatch hypothesised). Assert: fieldBars values finite,
  >0 count => >0 proportional width, key shape correct.
  3a STANDINGS SCROLL measured the wrong element -- trackRef on .sb-track, which
  grows to fit its rows so scrollHeight==clientHeight==0 distance. Now measures
  the fixed-height .sb-viewport (scrollHeight - clientHeight) with a row-count x
  46px fallback for pre-paint. 3b FINAL no longer scrolls -- reveal + shine
  only, scroll gated to !isFinal.
  4 COLUMNS reordered POS | GOLFER | PTS | THRU on both boards (points is the
  subject, THRU the timestamp, last).
  5 out_of_character never named its golfer (the "up" branch said "the outlier
  round of the year"); Handoff #9 1 was scoped too narrowly. Rewritten to lead
  with the name in both branches. The self-contained assert was STRENGTHENED:
  every beat with a non-null protagonist must contain that name in the caption
  (the weak version checked length/punct and passed the bug).
  6 EVENT IDENTITY: "Week N" removed from all captions + the final title (it is
  internal bookkeeping, same class as Wk -5 on charts) -- captions read
  self-contained without it. The beat footer now carries the date
  authoritatively: "Auto highlight   Jul 11, 2026" and "Added by X   Jul 11,
  2026", via footerDate() (month spelling matches the chart shortDate, plus the
  year since the footer is the identification line). Assert: no /Week \d/ in UI.
  Backtest 38 -> 41 tests, all green; typecheck/lint/build clean.
  DEVICE PASS STILL OWED: 2 (bars fill) and 3 (scroll timing/legibility) are
  fixed at the data/build layer and asserted, but a real 380px device pass has
  NOT been done in this environment -- verify on hardware before closing.
  BEATS_CACHE_VERSION bumped v8 -> v9; history rebuild required after deploy.

  UPDATE 2026-07-17 (Handoff #11, "hole image taxonomy + mobile anchor tooling").
  RENDER-ONLY -- no beat selection/ordering/detector/MC/gate change, so NO
  history rebuild and NO cache bump (still v9). Confirmed: nothing touches
  recapEngine/buildBeatsInput or the beat payload shape.
  1 TAXONOMY: hole_images.view_type is now four kinds -- artistic (beauty shots:
  event/upcoming cards, course stats, AND the blurred highlight background;
  NEVER traced), hole + green (tracer layouts, need anchors), course (routing
  map, one per course, NO consumer yet -- schema+upload only per the prove-
  before-build principle). Migration 20260717_hole_image_taxonomy.sql (NOT YET
  APPLIED, idempotent/re-runnable): BACKFILLS every pre-existing row to
  'artistic' -- the 20260715 migration added view_type with `default 'hole'`, so
  every existing beauty shot was mislabelled a tracer-able layout (THE bug in
  schema form). Sets default 'artistic', adds check(view_type in
  artistic/hole/green/course), and drops any legacy unique(course_name,
  hole_number) for unique(course_name,hole_number,view_type) + a partial
  one-map-per-course index -- so one hole holds artistic+hole+green at once.
  Keyed on course_name (the app's key everywhere; the handoff said course_id but
  that would be a whole-app migration for a cosmetic key). Report the
  before/after counts: `select view_type, count(*) from hole_images group by 1`.
  2 ADMIN > Course > Images (src/tabs/admin/HoleImageManager.tsx): coverage grid
  as the landing view -- 18 holes x 3 (artistic/hole/green) + a separate course-
  map slot, "N of 54 placed", per-cell states present / NEEDS ANCHORS / empty.
  Tapping a cell opens upload/replace + (hole/green) the anchor wizard. Replaces
  the old per-course hole-images modal (which only knew 'hole').
  3 ANCHOR WIZARD (src/tabs/admin/AnchorWizard.tsx) -- rebuilt for mobile
  precision, replaces AnchorTool.tsx (DELETED): sequential one-at-a-time steps,
  tap-to-place THEN drag-to-fine-tune, a MAGNIFIER LOUPE offset above the finger
  (so the finger never covers the target -- the iOS/Maps pattern), 1px nudge
  arrows, skippable dogleg-apex step, and a live preview across ALL valences
  (3/2/1/0 for hole; in-cup/beside/past for green) before saving. Reuses
  arcPath/puttPath via TracerSvg so preview == render. Reopening a placed hole
  shows the pins for adjustment. DEVICE PASS OWED: loupe precision cannot be
  validated in the type/build layer.
  4 UPLOAD: course assets go to R2 (zero egress; the Cache-Control header is not
  honored on this project's Supabase bucket). r2-presign gained an
  `asset:'course'` branch (key courses/{course_id}/{hole|'map'}/{view_type}-{uuid}
  .{ext}, image content-types, fresh uuid = cache-bust on replace); client
  uploadCourseAsset in r2Upload.ts compresses to 1600px q0.85. SINGLE WRITER:
  the constraint unique(course_name,hole_number,view_type) makes the Course>Images
  grid and the LeaderboardTab weekly-card uploader (CourseStatsModule) CONTEND
  for the same artistic row, so both now write through uploadCourseAsset (R2)
  and match one row; the LeaderboardTab path dropped its Supabase-Storage
  upload/remove (scorecard uploads are unrelated and still use Storage). Existing
  artistic URLs are NOT backfilled -- public_url is backend-invisible at read
  time so a dual-URL is harmless; the dual-WRITER was the actual defect.
  5 CONSUMERS: background -> artistic (holeAerialUrl/courseArtisticUrl now source
  artistic, fall back to any course artistic); focus card + tracer -> hole/green
  + ANCHORS. FALLBACK_ANCHORS and the fixed-arc path are REMOVED entirely -- a
  tracer now requires layout image AND anchors, else the beat renders its glass
  panel ONLY (no shot, no tracer). A wrong arc is worse than no arc. Card
  consumers (UpcomingCourseCard, LeaderboardTab feed/hero/weekly cards) switched
  to artistic via isArtisticView (isHoleView was RENAMED -> isArtisticView; null
  now means artistic). THIN BEATS: every hole-anchored middle beat (charge/run,
  collapse, hold, fast_start, hole-scoped tough_hole, nemesis-on-hole,
  redemption, out_of_character, fireworks ace/eagle) renders panel-only until
  layouts+anchors are authored -- the honest sparseness signal, visible in the
  coverage grid. Whole-round beats (grinder/wildcard/fade/rivalry) and standings
  beats (race-state/the_turn/final) were already panel/board-only -- unchanged.
  typecheck/build clean; new lint findings are the repo's usual exhaustive-deps
  warnings only. OPERATOR STEPS BEFORE THIS WORKS: apply
  20260717_hole_image_taxonomy.sql, re-deploy r2-presign, then author
  layout+anchor assets per hole in Admin > Course > Images.

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
