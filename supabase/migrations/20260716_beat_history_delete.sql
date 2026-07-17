-- The beat-history REBUILD (Admin > Events > "Rebuild Beat History", and the
-- auto-run on Score Entry finalize) is the SOLE writer of story_beats_history.
-- It works by deleting every row for each event and replaying the season in
-- date order (see src/lib/rebuildBeatHistory.ts). That delete-then-insert is
-- issued by the app's anon role via PostgREST:
--   supabase.from("story_beats_history").delete({ event_id: id })
--
-- 20260713 granted anon select+insert and 20260715 added update, but NEITHER
-- granted DELETE. Without it RLS silently blocks the delete (PostgREST removes
-- 0 rows, no error), so the rebuild's replay collides with the existing rows
-- on the unique (event_id, angle_type, protagonist_id) constraint and the
-- rebuild fails / no-ops. This migration adds the missing delete permission.
--
-- Idempotent: drop-then-create so it is safe to run more than once (matches
-- the pattern in 20260713 / 20260715).
drop policy if exists "anon delete beat history" on story_beats_history;
create policy "anon delete beat history" on story_beats_history for delete to anon using (true);

grant delete on story_beats_history to anon;
