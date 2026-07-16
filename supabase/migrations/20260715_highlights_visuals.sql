-- Recap visual language pass (Handoff #3). Additive only.
--
-- 1) Tracer anchors on hole_images. A hole may now have TWO rows per course:
--    the scenic/full 'hole' image (tee-to-green tracer) and a 'green' image
--    (putt-surface outcome view). anchors is normalized 0..1 JSON:
--      view_type='hole':  { tee, apex?, green, bunker, trouble }  (each {x,y})
--      view_type='green': { edge, pin }
--    Rows without anchors keep the legacy fixed-arc fallback in the viewer.
--    App code treats view_type NULL as 'hole' (pre-existing rows).
alter table hole_images add column if not exists view_type text default 'hole';
alter table hole_images add column if not exists anchors jsonb;

-- 2) Admin beat suppression + caption override. Auto beats are regenerated
--    deterministically (Monte Carlo seeded on event_id), so (event_id,
--    angle_type[, protagonist_id]) is a stable key. One row per surfaced
--    beat already exists (inserted by the module for anti-repeat); hidden
--    rows are filtered out BEFORE composition so the next-best candidate
--    fills the slot. caption_override, when set, replaces the generated
--    caption at render time (the engine stays pure).
alter table story_beats_history add column if not exists hidden boolean not null default false;
alter table story_beats_history add column if not exists caption_override text;

-- The app's anon role needs update on story_beats_history for the admin
-- hide / edit-caption actions (reads+inserts were granted in 20260713).
create policy "anon update beat history" on story_beats_history for update to anon using (true) with check (true);
grant update on story_beats_history to anon;
