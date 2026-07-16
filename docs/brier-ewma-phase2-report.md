# Phase 2 Report -- `brier_score_ewma` N+1 (DIAGNOSE ONLY)

_Date: 2026-07-16. No code changed. This is a findings + options document._

## TL;DR

**The Brier / EWMA read-modify-write loop is not in this repository.** There is
no client code that reads, writes, or computes `brier_score_ewma`,
`player_stats_cache`, or any EWMA. The 67,727 paired `UPDATE`/`SELECT` on
`player_stats_cache.brier_score_ewma` that `pg_stat_statements` reports is being
produced by **server-side code that lives outside this codebase** -- a Supabase
Edge Function, a database trigger/function, or a scheduled (pg_cron) job.

Therefore the specific Phase 2 questions (is it firing on mount? is the same
outcome folded twice? is there an event-keyed idempotency guard?) **cannot be
answered from this repo.** They must be answered against that server-side code
once it is located. This report gives the evidence, the shortlist of where to
look, and the exact checks to run there.

## What the grep actually found

Full-repo search for the Phase 2 keywords:

| Keyword | Occurrences in `src/` | Where |
|---|---|---|
| `brier` / `brier_score_ewma` | **0** | -- |
| `ewma` | **0** | -- |
| `player_stats_cache` | **1** | `src/lib/supabaseClient.ts:251` -- a primary-key mapping (`golfer_id`) in `PK_MAP`, used only so the REST pagination has a stable tiebreaker. Nothing reads or writes the table. |

The one hit is inert: it tells the REST shim what column to order by IF someone
ever paginates that table. No caller does.

## Why the writer must be server-side

Three independent signals:

1. **The client cannot do this volume.** 67,727 writes for a 25-player league
   over ~5 seasons is orders of magnitude more than there are `(player, event)`
   pairs (~25 players x ~125 events approx 3,100 max). A number that large is
   the signature of either a per-request server hook or a re-run cron, not a
   once-per-event client write.

2. **`event_odds` is already described as server-computed.** `docs/architecture.md`
   lists `event_odds` as "Pre-computed odds" / "pre-computed server-side," and
   the repo contains an undeployed Edge Function (`r2-presign`). Server-side
   compute for this app demonstrably exists; Brier fits that pattern (predictions
   in `event_odds.win_probability`, outcomes in `event_leaderboard`).

3. **The read-modify-write shape is a DB/Edge idiom.** `SELECT current ewma ->
   compute new ewma -> UPDATE` executed once per (player x something) is exactly
   what a `plpgsql` trigger on `hole_scores`/`event_leaderboard`, or an Edge
   Function looping over players, produces. The client's REST shim has no
   read-then-write helper that would emit this pair.

## Where to look (shortlist, most likely first)

These are outside this repo. Check them in the Supabase project:

1. **Database triggers / functions** -- `supabase/migrations/` here does not
   define one, but the live DB may have a trigger on `hole_scores` or
   `event_leaderboard` that recomputes `brier_score_ewma` on every row change.
   A trigger firing per hole-score row would explain the volume instantly
   (18 holes x 25 players x N events x re-saves).
   ```sql
   -- Run in the Supabase SQL editor:
   select event_object_table, trigger_name, action_statement
   from information_schema.triggers
   where action_statement ilike '%brier%' or action_statement ilike '%ewma%';

   select proname, prosrc from pg_proc where prosrc ilike '%brier_score_ewma%';
   ```

2. **Edge Functions** -- list deployed functions; grep their source for
   `brier`/`ewma`/`player_stats_cache`. A function invoked on page load or on
   odds refresh that loops `for (const player of players) { select; update; }`
   is the classic N+1.
   ```
   supabase functions list
   # then inspect the source of any that touch stats/odds
   ```

3. **pg_cron jobs** -- a scheduled recompute that re-folds the full history each
   run would inflate the count and (worse) corrupt the value, since EWMA is
   non-idempotent.
   ```sql
   select jobid, schedule, command from cron.job;
   ```

## The five Phase 2 questions -- how to answer each once code is found

1. **Firing on page load / mount vs once per event at scoring time?**
   -- If it's an Edge Function: check what invokes it (client hook on the Odds
   tab? on every app boot?). Grep this repo for `functions/v1/<name>` to see if
   the client triggers it -- I found only `send-push-notification` and
   `r2-presign` invoked from the client, neither Brier-related. If nothing here
   invokes it, it's a trigger or cron (server-only cadence).

2. **Same `(player, event)` outcome folded more than once?**
   -- This is the correctness risk. EWMA is order-dependent and non-idempotent;
   folding the same observation twice collapses the value toward it. Check
   whether the writer keys on `event_id` (or a processed-events set) before
   folding. If a trigger folds on every `hole_scores` write, the same event's
   outcome is folded up to 18x per player (once per hole) plus again on every
   correction -- **that would mean every stored Brier score is wrong.**

3. **Idempotency guard keyed on `event_id`?**
   -- Compare to the working reference in THIS repo: the TONY.AI generation
   guard at `src/tabs/odds/TonyInsight.tsx:255` upserts into `tony_insights`
   keyed so a given event generates once. The Brier writer needs the equivalent
   -- a `processed_event_id` guard or an upsert keyed on `(golfer_id, event_id)`
   into a raw-observations table, with the EWMA derived from distinct rows.

4. **`anon` role, last-write-wins across concurrent clients?**
   -- Only relevant if the writer is client-triggered. Two phones opening the
   app at once would each run the read-modify-write and race (last write wins,
   losing one fold or double-applying). If it's a trigger or cron, this is moot
   -- serialize within the DB.

5. **Compute Brier on READ instead? (recommended direction)**
   -- Per this project's stated compute-on-read-not-write principle (see the
   Highlights "data beats" design, and `docs/context.md` Handoff #6 which
   removed a write-on-read side effect for exactly this class of bug), a cached
   `brier_score_ewma` column is a **second source of truth that is derivable**
   from data already stored:
     - predictions: `event_odds.win_probability` per (golfer, event)
     - outcomes: win/placement from `event_leaderboard`
   Brier = mean of `(predicted_prob - actual_outcome)^2` over events. This is a
   pure aggregate over immutable historical rows -- computable on read, cacheable
   client-side keyed by season (same pattern Phase 3 proposes for historical
   leaderboards). If Brier is computed on read, `player_stats_cache.brier_score_ewma`
   can be dropped entirely, which eliminates the 67,727-write loop AND the
   correctness drift at once.
   -- Caveat: a true EWMA is order-dependent by design (recent events weighted
   more). If the product genuinely wants a recency-weighted Brier (not a flat
   mean), the on-read computation must replay events in chronological order and
   apply the decay -- still pure, still derivable, just ordered. Confirm the
   intended semantics before choosing flat-mean vs EWMA-on-read.

## Recommended options (no code yet -- your call)

- **Option A (preferred): kill the cached column, compute on read.** Locate the
  server writer, delete it, and compute Brier (flat or ordered-EWMA) from
  `event_odds` + `event_leaderboard` on the client, cached per season. Removes
  the write loop and the correctness bug in one move. Aligns with the project's
  compute-on-read principle.
- **Option B: keep the column, fix the writer.** Add an `event_id`-keyed
  idempotency guard (mirror the TONY.AI pattern), move the write to once-per-event
  at scoring finalize (not per hole, not on mount), and backfill/recompute the
  historical values once chronologically. More moving parts; keeps a derivable
  column as a second source of truth.
- **Option C: diagnose-only for now.** Run the three SQL probes above to confirm
  which server mechanism is responsible and whether values are already corrupted
  (spot-check: does a player's stored `brier_score_ewma` match a hand-computed
  flat Brier from their `event_odds`/`event_leaderboard` history? A large mismatch
  confirms double-folding).

**No changes will be made to the Brier calculation until you approve a fix and,
if it's Option A or B, until the server-side writer is located and shared.**
