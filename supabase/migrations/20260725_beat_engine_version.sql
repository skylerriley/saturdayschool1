-- Stamp each story_beats_history row with the engine version that authored it.
--
-- WHY: beats are composed on read with the CURRENT engine, but the anti-repeat
-- window they read is the PERSISTED rows -- which may have been written by an
-- OLDER engine build. A reader had no way to detect that mismatch, so a stale
-- window silently fed the anti-repeat and reads disagreed with the rebuild
-- (e.g. a fade surfaced on read that the rebuild never stored, letting the same
-- golfer's fade repeat the following event). This column lets a reader tell
-- whether the window is current and trigger a rebuild when it is not.
--
-- Idempotent / re-runnable. Additive: NULL means "written before this column"
-- (treated as stale, i.e. not the current version).
alter table if exists public.story_beats_history
  add column if not exists engine_version text;

comment on column public.story_beats_history.engine_version is
  'BEATS_CACHE_VERSION of the engine that authored this row. NULL = pre-migration (stale). The read path rebuilds when a window row is not the current version.';
