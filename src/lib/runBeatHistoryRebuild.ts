// Shared "rebuild + persist" wrapper so the admin button (BeatHistoryRebuild)
// and the read-path auto-heal (HighlightsModule) drive the SAME storage path.
// rebuildBeatHistory itself stays pure (storage injected); this binds it to the
// live Supabase wrapper and clears this device's sessionStorage beat cache.
//
// engine_version stamping happens INSIDE rebuildBeatHistory (every row carries
// BEATS_CACHE_VERSION), so any row this writes is current by construction.
import { supabase } from "./supabaseClient";
import { golferName } from "./formatters";
import { rebuildBeatHistory, type RebuildResult } from "./rebuildBeatHistory";

export interface RunRebuildDeps {
  events: any[];
  courses: any[];
  signups: any[];
  golfers: any[];
  leaderboard: any[];
  holeScores: any[];
  onProgress?: (done: number, total: number, label: string) => void;
}

export async function runBeatHistoryRebuild(deps: RunRebuildDeps): Promise<RebuildResult> {
  // Read admin edits (hidden / caption_override) BEFORE the wipe so they survive.
  let existingRows: any[] = [];
  try {
    existingRows = await supabase.from("story_beats_history").select("*", "");
  } catch (_: any) { /* continue -- admin edits may be lost, but the rebuild must still run */ }

  const result = await rebuildBeatHistory({
    events: deps.events,
    courses: deps.courses,
    signups: deps.signups,
    golfers: deps.golfers,
    leaderboard: deps.leaderboard,
    holeScores: deps.holeScores,
    golferName,
    existingRows,
    deleteAll: async () => {
      // The REST wrapper's delete() needs an equality match, so clear per
      // event id rather than a blanket truncate.
      const ids = [...new Set(existingRows.map((r: any) => r.event_id))];
      for (const id of ids) {
        await supabase.from("story_beats_history").delete({ event_id: id });
      }
    },
    insertRows: async (rows: any[]) => { await supabase.from("story_beats_history").insert(rows); },
    onProgress: deps.onProgress,
  });

  // Beats are cached per event in sessionStorage; the rebuild can change them,
  // so drop this device's cache. Other devices recompose on their next read
  // (their cached beats predate the rebuild) -- the version-stamp staleness
  // check is what makes that safe now.
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("hl_beats_"))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch (_: any) { /* sessionStorage unavailable -- harmless */ }

  return result;
}
