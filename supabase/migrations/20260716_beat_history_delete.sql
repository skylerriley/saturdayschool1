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
-- Idempotent: guarded so it is safe to run more than once.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'story_beats_history'
      and policyname = 'anon delete beat history'
  ) then
    create policy "anon delete beat history"
      on story_beats_history for delete to anon using (true);
  end if;
end $$;

grant delete on story_beats_history to anon;
