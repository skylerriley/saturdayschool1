// Admin action: rebuild story_beats_history (the recap anti-repeat state).
//
// Runs CLIENT-SIDE on the admin's device: every input table is already loaded
// in App state, the engine is pure TypeScript, and at ~7 events (growing ~25
// a year) the whole chronological replay is a few hundred ms of local compute
// plus one DELETE and one INSERT per event. No edge function needed; revisit
// only if this grows into the thousands.
//
// This is the SOLE writer of story_beats_history -- reads never write (see
// HighlightsModule). Run it after ANY change to detectors, thresholds, or the
// composer, because stored rows were authored by the engine as it was then and
// they feed the anti-repeat of every later event.
import { useState } from "react";
import { reportWriteError } from "../../lib/supabaseClient";
import { runBeatHistoryRebuild } from "../../lib/runBeatHistoryRebuild";
import { BEATS_CACHE_VERSION } from "../../lib/buildBeatsInput";

export function BeatHistoryRebuild({ events, courses, signups, golfers, leaderboard, holeScores, showSuccess }: any) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setLog(["Reading existing rows..."]);
    try {
      const result = await runBeatHistoryRebuild({
        events, courses, signups, golfers, leaderboard, holeScores,
        onProgress: (done, total, label) => {
          setLog((p) => [...p, `(${done}/${total}) ${label}`]);
        },
      });

      setLog((p) => [
        ...p,
        `Done: ${result.eventsProcessed} event(s), ${result.rowsWritten} row(s), ${result.adminEditsCarried} admin edit(s) carried.`,
        `Client beat cache cleared (${BEATS_CACHE_VERSION}).`,
      ]);
      showSuccess("Beat history rebuilt");
    } catch (e: any) {
      reportWriteError("Beat history rebuild")(e);
      setLog((p) => [...p, `FAILED: ${e?.message || String(e)}`]);
    }
    setRunning(false);
  };

  return (
    <div style={{ marginTop: 24, padding: "16px", background: "var(--surface2)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Recap Beat History</div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
        Replays every hole-by-hole event in date order and rewrites the recap anti-repeat state.
        Run this after changing recap detectors or thresholds. Safe to re-run -- the result is
        deterministic, so two runs produce identical rows. Admin hides and caption edits are preserved.
      </p>
      <button
        onClick={run}
        disabled={running}
        className="btn btn-outline"
        style={{ fontSize: 13, fontWeight: 700, opacity: running ? 0.6 : 1 }}
      >
        {running ? "Rebuilding..." : "Rebuild Beat History"}
      </button>
      {log.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace", maxHeight: 220, overflowY: "auto", lineHeight: 1.6 }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
