-- Highlight view tracking ("Seen by") -- Handoff #13.
-- One row per (beat, viewer): who has watched a given card in the recap reel.
-- Pure analytics sink: this table is written on read from the viewer and is
-- NEVER read by the beat selector. See the two hard rules below.
--
-- Prerequisite: 20260713_highlights.sql (creates `highlights`). This migration
-- references highlights(id) for the human-highlight foreign key.
--
-- IDENTITY MODEL: same as the rest of highlights -- no auth, names come from
-- the member-identity picker (localStorage ss_member), so viewer_name is plain
-- text and the anon role does everything.
--
-- TWO KINDS OF BEAT in one table:
--   human highlight -> highlight_id set, angle_type null
--   auto data beat  -> angle_type set, highlight_id null (nothing persists for
--                      auto beats; they are recomputed on read)
--
-- beat_key is the DEDUPE KEY and the reason this is one text column rather than
-- a composite unique over the nullable id/angle columns. Postgres treats NULLs
-- as DISTINCT in a unique index, so unique(highlight_id, angle_type,
-- viewer_name) would NOT dedupe auto-beat rows (highlight_id is null there) --
-- every view would insert a fresh row. The text key makes dedupe work for both
-- kinds. highlight_id / angle_type stay as denormalized columns purely for
-- readable analytics queries; uniqueness lives on beat_key.
--   human highlight -> 'h:' || highlight_id
--   auto beat       -> 'a:' || event_id || ':' || angle_type
--
-- ISOLATION INVARIANT (Handoff #6 "reads never write" is about
-- story_beats_history, which feeds beat SELECTION -- writing it on read
-- reintroduces nondeterminism). highlight_views does NOT feed selection, so
-- writing it on read is fine, and it MUST stay that way:
--   1. highlight_views must NEVER be read by recapEngine.ts, buildBeatsInput.ts,
--      the composer, or the history rebuild. It is a pure analytics sink.
--   2. The client write is fire-and-forget: never awaited on the render path,
--      wrapped in try/catch, silent on failure -- a failed insert must never
--      affect what renders.

create table if not exists highlight_views (
  id           bigint generated always as identity primary key,
  beat_key     text   not null,           -- dedupe key; see header
  event_id     bigint not null,           -- for scoping / per-event queries
  highlight_id bigint references highlights(id) on delete cascade,  -- human only, else null
  angle_type   text,                      -- auto beats only, else null
  viewer_name  text   not null,
  viewed_at    timestamptz not null default now()
);

-- Dedupe: "who has seen this", not "how many times". One row per viewer/beat.
create unique index if not exists highlight_views_uniq
  on highlight_views (beat_key, viewer_name);

create index if not exists highlight_views_event_idx
  on highlight_views (event_id);

-- RLS: anon does everything, mirroring the rest of highlights.
--
-- SECURITY NOTE (state plainly): all policies are on the `anon` role because
-- auth is PIN-based with no Supabase session. The admin / uploader gating on
-- the "Seen by" chip is therefore UI-LEVEL, NOT security-level -- anyone with
-- the anon key could query this table directly. For a ~25-person private
-- league that is an acceptable trade, but it is a known trade, not an assumed
-- protection.
alter table highlight_views enable row level security;

-- Idempotent (Postgres has no "create policy if not exists"): drop-then-create
-- so the whole file re-runs cleanly.
drop policy if exists "anon read highlight views"   on highlight_views;
create policy "anon read highlight views"   on highlight_views for select to anon using (true);
drop policy if exists "anon insert highlight views" on highlight_views;
create policy "anon insert highlight views" on highlight_views for insert to anon with check (true);

grant select, insert on highlight_views to anon;
