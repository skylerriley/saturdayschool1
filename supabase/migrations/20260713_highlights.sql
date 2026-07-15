-- Event Highlights + Auto Recap (admin-gated v1).
-- Human photo/video moments uploaded by members. Media itself lives on
-- Cloudflare R2 (see docs/highlights-r2-setup.md); these tables store only
-- URLs + metadata. Auto "data beats" are NOT stored -- they are regenerated
-- on read from hole_scores/event_leaderboard, which is why only human rows
-- persist here.
--
-- Identity model matches the app (no auth): names are captured from the
-- member-identity picker (localStorage ss_member), so all people columns are
-- plain text names, and the anon role gets read/write per app convention.
--
-- TWO-NAME MODEL on highlights:
--   golfer_name     = the SUBJECT (who the moment is about)
--   created_by_name = the UPLOADER (the "Added by" credit)

create table if not exists highlights (
  id              bigint generated always as identity primary key,
  event_id        bigint not null references events(event_id),
  golfer_name     text   not null,
  created_by_name text   not null,
  hole_number     int,                              -- null => clubhouse / no-hole
  pre_round       boolean not null default false,   -- true => cold-open (tee-off etc.)
  media_type      text   not null,                  -- 'photo' | 'video'
  media_url       text   not null,                  -- R2 public URL (full asset)
  thumb_url       text   not null,                  -- R2 public URL (small square)
  caption         text,
  hidden          boolean not null default false,   -- admin soft-hide (hide-over-delete)
  created_at      timestamptz not null default now()
);

create table if not exists highlight_likes (
  -- Surrogate id PK (not in the original spec): the app's REST shim paginates
  -- ordered by "created_at,id", so every table needs an id column.
  id           bigint generated always as identity primary key,
  highlight_id bigint not null references highlights(id) on delete cascade,
  liker_name   text   not null,
  created_at   timestamptz not null default now(),
  unique (highlight_id, liker_name)                 -- no double-likes
);

create table if not exists highlight_comments (
  id             bigint generated always as identity primary key,
  highlight_id   bigint not null references highlights(id) on delete cascade,
  commenter_name text   not null,
  text           text   not null,
  created_at     timestamptz not null default now()
);

-- Anti-repeat memory for the auto-beat selector: one row per surfaced data
-- beat. The selector reads the last few events and decays the weight of
-- recently-used angle types / protagonists.
create table if not exists story_beats_history (
  id             bigint generated always as identity primary key,
  event_id       bigint not null references events(event_id),
  angle_type     text   not null,        -- 'opening'|'charge'|'collapse'|'hold'|'final'|...
  protagonist_id bigint,                 -- golfer_id of the starring player (null = field-wide)
  strength       double precision not null default 0,
  created_at     timestamptz not null default now(),
  unique (event_id, angle_type, protagonist_id)
);

create index if not exists highlights_event_idx on highlights (event_id);
create index if not exists highlight_likes_highlight_idx on highlight_likes (highlight_id);
create index if not exists highlight_comments_highlight_idx on highlight_comments (highlight_id);
create index if not exists story_beats_history_event_idx on story_beats_history (event_id);

-- RLS: mirror the app's existing model -- the anon role does everything the
-- client needs. Reads for all; inserts for uploads/likes/comments/beat
-- history; update on highlights only (admin soft-hide via `hidden`); delete
-- on highlight_likes only (unlike toggle).
alter table highlights enable row level security;
alter table highlight_likes enable row level security;
alter table highlight_comments enable row level security;
alter table story_beats_history enable row level security;

create policy "anon read highlights"        on highlights          for select to anon using (true);
create policy "anon insert highlights"      on highlights          for insert to anon with check (true);
create policy "anon hide highlights"        on highlights          for update to anon using (true) with check (true);

create policy "anon read likes"             on highlight_likes     for select to anon using (true);
create policy "anon insert likes"           on highlight_likes     for insert to anon with check (true);
create policy "anon delete likes"           on highlight_likes     for delete to anon using (true);

create policy "anon read comments"          on highlight_comments  for select to anon using (true);
create policy "anon insert comments"        on highlight_comments  for insert to anon with check (true);

create policy "anon read beat history"      on story_beats_history for select to anon using (true);
create policy "anon insert beat history"    on story_beats_history for insert to anon with check (true);

grant select, insert, update on highlights          to anon;
grant select, insert, delete on highlight_likes     to anon;
grant select, insert         on highlight_comments  to anon;
grant select, insert         on story_beats_history to anon;
