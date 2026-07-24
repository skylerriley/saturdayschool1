// THE SOLE AUTHOR of story_beats_history.
//
// WHY THIS EXISTS
// Beats are computed on read from (event data + history). Event data and the
// Monte Carlo are deterministic (seeded on event_id). History is NOT derivable
// from a single event -- it is sequence state -- so it is the one thing we
// store. If reads also wrote it, the story would become a side effect of who
// viewed what in which order: opening the newest event first finds no rows for
// events N-1..N-6, the anti-repeat never engages, and every event composes as
// if it were the first ever played. (Measured on the real fixture: 6/7 events
// told a different story by viewing order, and wildcard fired 7/7 instead of
// 2/7.) So: READS ARE PURE; this rebuild is the only writer.
//
// The replay MUST be chronological -- event N's cooldowns depend on N-1..N-6,
// exactly like the stateful ESR/cap chain in the WHS handicap engine.
//
// Idempotent: same events + seeded Monte Carlo => byte-identical rows, so a
// full re-run is always safe and always correct. Prefer re-running the whole
// chain over incremental appends.
//
// RUN IT AFTER ANY CHANGE to detectors, thresholds, or the composer -- stored
// rows were authored by the engine as it was at the time, and they feed the
// anti-repeat of every later event. See docs/highlights-r2-setup.md.
import { selectDataBeats } from "./recapEngine";
import { buildBeatsInput, hasHoleByHoleData } from "./buildBeatsInput";

export interface RebuildDeps {
  events: any[];
  courses: any[];
  signups: any[];
  golfers: any[];
  leaderboard: any[]; // event_leaderboard rows (all events)
  holeScores: any[];
  golferName: (golfers: any[], golferId: number) => string;
  // Storage seam -- injected so the replay itself stays pure and testable.
  deleteAll: () => Promise<void>;
  insertRows: (rows: any[]) => Promise<void>;
  onProgress?: (done: number, total: number, label: string) => void;
  // Existing rows, read BEFORE the wipe. Admin edits (hidden /
  // caption_override) are authored by a human, not derivable from scores, so
  // they are carried across the rebuild and re-attached by
  // (event_id, angle_type, protagonist_id). An edit whose beat no longer
  // survives the new engine is simply dropped -- it has nothing to attach to.
  existingRows?: any[];
}

export interface RebuildResult {
  eventsProcessed: number;
  rowsWritten: number;
  // Every row the replay produced, in write order -- returned so callers (and
  // the determinism test) can compare two runs without touching storage.
  rows: any[];
  // Admin edits that survived (were re-attached to a still-existing beat).
  adminEditsCarried: number;
}

// Replays every hole-by-hole event in date order, composing each event against
// the rows produced by the events before it. Pure except for the injected
// storage calls.
export async function rebuildBeatHistory(deps: RebuildDeps): Promise<RebuildResult> {
  const completed = (deps.events || [])
    .filter((e: any) => e.status === "Completed" && e.date)
    .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))); // ASC -- required

  // Carry human-authored admin state across the wipe (see existingRows).
  const editKey = (r: any) => `${r.event_id}|${r.angle_type}|${r.protagonist_id ?? "-"}`;
  const adminEdits: Record<string, { hidden?: boolean; caption_override?: string | null }> = {};
  (deps.existingRows || []).forEach((r: any) => {
    if (r.hidden === true || (r.caption_override != null && r.caption_override !== "")) {
      adminEdits[editKey(r)] = { hidden: r.hidden === true, caption_override: r.caption_override ?? null };
    }
  });

  await deps.deleteAll();

  const written: any[] = [];
  let processed = 0;
  let adminEditsCarried = 0;
  for (const event of completed) {
    const eventEntries = (deps.leaderboard || []).filter((r: any) => r.event_id === event.event_id);
    if (!hasHoleByHoleData(eventEntries)) continue; // no hole data => no beats

    const course = (deps.courses || []).find((c: any) => c.course_name === event.course_name);
    const seasonWeek = (deps.events || [])
      .filter((e: any) => e.status === "Completed" && e.season === event.season && e.date <= event.date).length;

    const beats = selectDataBeats(buildBeatsInput({
      event,
      course,
      courses: deps.courses,
      signups: deps.signups,
      golfers: deps.golfers,
      eventEntries,
      holeScores: deps.holeScores,
      leaderboard: deps.leaderboard,
      events: deps.events,
      eventLabel: `Week ${seasonWeek || ""}`.trim(),
      // Only what THIS replay has produced so far -- never a live fetch, so
      // the result cannot depend on pre-existing rows.
      historyRows: written,
      // Carried admin hides must apply DURING composition, exactly as they do
      // on read (hidden angles are filtered pre-composition so the next-best
      // candidate fills the slot). Otherwise the rebuild would author a row
      // for a beat the viewer never sees.
      hiddenRows: (deps.existingRows || []).filter((r: any) => r.hidden === true && r.event_id === event.event_id),
      golferName: deps.golferName,
    }));

    // duel_tape is a COMPANION card, not a story angle -- it always rides with
    // a duel beat and must not create its own history row (it would pollute the
    // anti-repeat frequency table with a non-angle and double-count the duel
    // against cooldowns). The duel row it accompanies carries the identity.
    const rows = beats.filter((b) => b.angle !== "duel_tape").map((b) => {
      const base: any = {
        event_id: event.event_id,
        angle_type: b.angle,
        protagonist_id: b.protagonistId,
        hole: b.hole,
        strength: b.strength,
      };
      const edit = adminEdits[editKey(base)];
      if (edit) {
        adminEditsCarried += 1;
        if (edit.hidden) base.hidden = true;
        if (edit.caption_override != null) base.caption_override = edit.caption_override;
      }
      return base;
    });
    if (rows.length > 0) {
      await deps.insertRows(rows);
      written.push(...rows);
    }
    processed += 1;
    deps.onProgress?.(processed, completed.length, `${event.date} (event ${event.event_id}): ${rows.length} beats`);
  }

  return { eventsProcessed: processed, rowsWritten: written.length, rows: written, adminEditsCarried };
}
