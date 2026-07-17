-- Hole image taxonomy (Handoff #11). Fixes the view_type-default hazard and
-- opens the table to four distinct image kinds. Additive + idempotent: safe to
-- re-run, per the established pattern. Keyed on course_name (the table's key
-- everywhere in the app; a course has many tee rows sharing one course_name).
--
-- THE FOUR KINDS (they are NOT interchangeable):
--   artistic : composed beauty shots -- event/upcoming cards, course stats, AND
--              the blurred background on every highlight beat. NEVER traced.
--   hole     : full tee-to-green layout -- focus card + tracer on hole beats.
--              anchors: { tee, apex?, green, bunker, trouble } (each {x,y} 0..1)
--   green    : green-only view -- focus card + tracer on green-focused beats.
--              anchors: { edge, pin }
--   course   : full routing map, ONE per course (hole_number null). No consumer
--              yet (schema+upload only -- see Handoff #11 sec 8).
--
-- THE HAZARD THIS FIXES: 20260715_highlights_visuals.sql added
--   view_type text default 'hole'
-- so EVERY pre-existing beauty shot became labelled a tracer-able layout. This
-- backfills them to 'artistic' (they are all beauty shots) so no artistic image
-- can ever receive a tracer.

-- 1) Ensure the columns exist (no-op if 20260715 already ran).
alter table hole_images add column if not exists view_type text;
alter table hole_images add column if not exists anchors jsonb;

-- 2) BACKFILL: every row that predates this taxonomy is an artistic beauty shot.
--    A pre-existing row is one with no anchors AND a legacy/absent view_type
--    ('hole' from the bad default, or null). Rows that already carry authored
--    anchors are genuine 'hole'/'green' layouts made with the anchor tool since
--    Handoff #3 -- leave those alone. Idempotent: re-running only ever touches
--    rows still sitting at the legacy value with no anchors.
--    (Report the counts around this in the deploy log -- see sec 3 of the
--    handoff. Query: select view_type, count(*) from hole_images group by 1.)
update hole_images
   set view_type = 'artistic'
 where anchors is null
   and (view_type is null or view_type = 'hole');

-- 3) Any straggler nulls (shouldn't exist after step 2, but be total): default
--    a null view_type to 'artistic' as well -- an untyped, un-anchored image is
--    a beauty shot by definition here.
update hole_images set view_type = 'artistic' where view_type is null;

-- 4) Column default: make it explicit + safe. 'artistic' is the only kind an
--    untyped upload could safely be (a beauty shot is never traced), so a
--    forgotten view_type degrades to harmless rather than to a wrong tracer.
alter table hole_images alter column view_type set default 'artistic';

-- 5) Check constraint: only the four known kinds. Drop-then-add so re-running
--    replaces cleanly (Postgres has no "add constraint if not exists").
alter table hole_images drop constraint if exists hole_images_view_type_chk;
alter table hole_images
  add constraint hole_images_view_type_chk
  check (view_type in ('artistic','hole','green','course'));

-- 6) Uniqueness: allow ONE row per (course_name, hole_number, view_type) so a
--    single hole can hold artistic + hole + green at once. 'course' rows have a
--    null hole_number; Postgres treats nulls as distinct in a unique index, so
--    a partial unique index pins course maps to one-per-course separately.
--
--    The table's ORIGINAL unique constraint (if any) predates these migrations
--    and its name is unknown, so drop any unique constraint whose columns are
--    exactly (course_name, hole_number) before creating the new one. Done in a
--    DO block that discovers the constraint by its column set.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'hole_images'
       and con.contype = 'u'
       and (
         select array_agg(att.attname::text order by att.attname::text)
           from unnest(con.conkey) as k(attnum)
           join pg_attribute att
             on att.attrelid = con.conrelid and att.attnum = k.attnum
       ) = array['course_name','hole_number']::text[]
  loop
    execute format('alter table hole_images drop constraint %I', c.conname);
  end loop;
end $$;

-- Also drop a bare unique INDEX on the same pair, if one exists instead of a
-- constraint (older projects sometimes used create unique index directly).
drop index if exists hole_images_course_hole_uidx;

-- New composite unique index for the per-hole views (hole/green/artistic).
-- hole_number is not null for these three; the 'course' map (hole_number null)
-- falls outside this index and is pinned by the partial index below.
create unique index if not exists hole_images_course_hole_view_uidx
  on hole_images (course_name, hole_number, view_type)
  where hole_number is not null;

-- One 'course' routing map per course.
create unique index if not exists hole_images_course_map_uidx
  on hole_images (course_name)
  where view_type = 'course';
