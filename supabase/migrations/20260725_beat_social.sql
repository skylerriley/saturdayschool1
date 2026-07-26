-- Likes + comments on AUTO DATA BEATS (Handoff #19).
--
-- WHY: likes/comments launched keyed on highlights(id) -- an integer row id that
-- only human photo/video moments have. Auto data beats are recomputed on read
-- and never persist a row, so they had no id to hang social rows on and were
-- silently un-likeable / un-commentable. The "Seen by" feature (20260723) already
-- solved beat identity with a stable TEXT beat_key:
--   human highlight -> 'h:' || highlight_id
--   auto data beat  -> 'a:' || event_id || ':' || angle_type
-- This migration generalizes highlight_likes / highlight_comments the same way,
-- so ONE social path serves both kinds.
--
-- Prerequisite: 20260713_highlights.sql (creates highlight_likes / _comments with
-- the highlight_id-keyed unique constraints this migration replaces).
--
-- Idempotent / re-runnable. Additive: existing human rows keep their highlight_id;
-- beat_key is backfilled to 'h:'||highlight_id for them so the new unique index
-- and the app's beat_key lookups cover both new and legacy rows.

-- ---- highlight_likes ------------------------------------------------------------
alter table if exists highlight_likes
  add column if not exists beat_key text;

-- Denormalized analytics column mirroring highlight_views: the auto-beat angle
-- ('charge'|'fade'|...) for auto rows, null for human rows. Uniqueness lives on
-- beat_key; this is purely for readable per-angle queries.
alter table if exists highlight_likes
  add column if not exists angle_type text;

-- Backfill legacy human rows to the same key the app now computes for them.
update highlight_likes set beat_key = 'h:' || highlight_id
  where beat_key is null and highlight_id is not null;

-- Auto-beat rows have no highlight_id; drop the NOT NULL so they can be inserted.
alter table if exists highlight_likes
  alter column highlight_id drop not null;

-- Swap the dedupe key from (highlight_id, liker_name) to (beat_key, liker_name).
-- The original UNIQUE was created inline (`unique (highlight_id, liker_name)` in
-- 20260713), so Postgres auto-named it. Rather than guess the name, find and drop
-- ANY unique constraint on exactly (highlight_id, liker_name). This MUST go: auto
-- beats carry highlight_id = NULL, and while Postgres treats NULLs as distinct
-- (so it wouldn't block auto-beat likes), leaving it means two competing dedupe
-- keys on the human rows -- the beat_key one is now the single source of truth.
do $$
declare c text;
begin
  select con.conname into c
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'highlight_likes' and con.contype = 'u'
    and con.conkey = (
      select array_agg(a.attnum order by a.attnum)
      from pg_attribute a
      where a.attrelid = con.conrelid
        and a.attname in ('highlight_id', 'liker_name')
    );
  if c is not null then
    execute format('alter table highlight_likes drop constraint %I', c);
  end if;
end $$;

drop index if exists highlight_likes_uniq;
create unique index if not exists highlight_likes_uniq
  on highlight_likes (beat_key, liker_name);

create index if not exists highlight_likes_beat_key_idx
  on highlight_likes (beat_key);

-- ---- highlight_comments ---------------------------------------------------------
alter table if exists highlight_comments
  add column if not exists beat_key text;

alter table if exists highlight_comments
  add column if not exists angle_type text;

update highlight_comments set beat_key = 'h:' || highlight_id
  where beat_key is null and highlight_id is not null;

alter table if exists highlight_comments
  alter column highlight_id drop not null;

create index if not exists highlight_comments_beat_key_idx
  on highlight_comments (beat_key);

-- ---- grants / RLS ---------------------------------------------------------------
-- The 20260713 policies already grant anon select/insert on both tables and
-- delete on highlight_likes (the unlike toggle). Those policies use `check
-- (true)` / `using (true)`, so they cover beat_key rows unchanged -- nothing to
-- add here. Re-stating the grants is harmless and keeps this file self-contained
-- for a fresh apply that runs migrations out of the original order.
grant select, insert, delete on highlight_likes    to anon;
grant select, insert         on highlight_comments to anon;

comment on column highlight_likes.beat_key is
  'Stable social key (matches highlight_views.beat_key): human=''h:''||highlight_id, auto beat=''a:''||event_id||'':''||angle_type. Dedupe is unique(beat_key, liker_name); highlight_id is now nullable (auto beats have none).';
comment on column highlight_comments.beat_key is
  'Stable social key (matches highlight_views.beat_key): human=''h:''||highlight_id, auto beat=''a:''||event_id||'':''||angle_type. highlight_id is now nullable (auto beats have none).';
