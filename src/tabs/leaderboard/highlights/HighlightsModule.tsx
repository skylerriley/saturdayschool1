// Event Highlights module (admin-gated v1).
// Mounts on the completed-event detail overlay between the skins card and the
// leaderboard. Renders a horizontal story rail; opens the full-screen story
// viewer (HighlightsViewer) and the add-highlight flow (AddHighlightFlow).
//
// Data model: human moments persist in the `highlights` table (media on R2);
// auto data beats are regenerated on read from hole scores via
// src/lib/recapEngine.ts and are never stored (only their angle/protagonist
// go to story_beats_history for anti-repeat).
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, reportWriteError } from "../../../lib/supabaseClient";
import { golferName } from "../../../lib/formatters";
import { selectDataBeats, buildPlayerHistories, watchOrderCompare, type DataBeat, type BeatStandingRow } from "../../../lib/recapEngine";
import { holeAerialUrl, type RecapCard } from "./highlightsShared";
import { HighlightsViewer } from "./HighlightsViewer";
import { AddHighlightFlow } from "./AddHighlightFlow";

const AUTO_ICON = (
  <svg viewBox="0 0 24 24" style={{ width: "100%", height: "100%", fill: "currentColor" }}>
    <path d="M4 20V6l7 4 9-6v14l-9 5-7-4z" />
  </svg>
);

export function HighlightsModule({ event, course, golfers, eventEntries, holeScores, holeImages, memberGolferId, adminMode, eventNumber, recentEventIds, leaderboard, events }: any) {
  const eventId = event.event_id;

  // Hard gate for auto beats: same predicate the skins card uses -- every
  // leaderboard entry must be Hole-by-Hole. Otherwise zero data beats.
  const hasHoleData = eventEntries.length > 0 && eventEntries.every((e: any) => e.entry_type === "Hole-by-Hole");

  const [rows, setRows] = useState<any[] | null>(null); // null = loading
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [beats, setBeats] = useState<DataBeat[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Fetch human highlights + their social rows. Only runs when the module is
  // mounted, which only happens behind the admin gate -- members never hit
  // these tables.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hl = await supabase.from("highlights").select("*", `&event_id=eq.${eventId}&hidden=eq.false`);
        if (cancelled) return;
        setRows(hl);
        if (hl.length > 0) {
          const ids = hl.map((r: any) => r.id).join(",");
          const [lk, cm] = await Promise.all([
            supabase.from("highlight_likes").select("*", `&highlight_id=in.(${ids})`),
            supabase.from("highlight_comments").select("*", `&highlight_id=in.(${ids})`),
          ]);
          if (cancelled) return;
          setLikes(lk);
          setComments(cm);
        }
      } catch (_: any) {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  // Generate data beats (win-prob replay path). Cached per event in
  // sessionStorage so the story is stable within a session (the Monte Carlo
  // uses randomness) and reopening the overlay is instant.
  useEffect(() => {
    if (!hasHoleData) { setBeats([]); return; }
    const cacheKey = `hl_beats_v2_${eventId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setBeats(JSON.parse(cached)); return; }
    } catch (_: any) {}

    let cancelled = false;
    (async () => {
      // Recent history for anti-repeat (last ~4 completed events + this one).
      let history: any[] = [];
      const histIds = [...(recentEventIds || []), eventId];
      try {
        history = await supabase.from("story_beats_history").select("*", `&event_id=in.(${histIds.join(",")})`);
      } catch (_: any) {}
      if (cancelled) return;

      const players = eventEntries
        .filter((e: any) => e.entry_type === "Hole-by-Hole")
        .map((e: any) => ({ golferId: e.golfer_id, name: golferName(golfers, e.golfer_id), summaryId: e.summary_id }));
      const summaryToGolfer: Record<number, number> = {};
      players.forEach((p: any) => { summaryToGolfer[p.summaryId] = p.golferId; });
      const scores = holeScores
        .filter((h: any) => summaryToGolfer[h.summary_id] != null && h.stableford_points != null)
        .map((h: any) => ({
          golferId: summaryToGolfer[h.summary_id],
          hole: h.hole_number,
          stableford: h.stableford_points,
          gross: h.gross_score ?? null,
        }));

      // Cross-event history for Tier-2 detectors (nemesis / redemption /
      // out-of-character / rivalry), built from tables the app already holds.
      const completedEvts = (events || []).filter((e: any) => e.status === "Completed").map((e: any) => ({ event_id: e.event_id, date: e.date }));
      const priorEventIds = new Set(completedEvts.filter((e: any) => e.date < event.date).map((e: any) => e.event_id));
      const priorSummaryInfo: Record<number, { golfer_id: number; event_id: number }> = {};
      (leaderboard || []).forEach((r: any) => {
        if (priorEventIds.has(r.event_id)) priorSummaryInfo[r.summary_id] = { golfer_id: r.golfer_id, event_id: r.event_id };
      });
      const priorHoleRows = holeScores
        .filter((h: any) => priorSummaryInfo[h.summary_id] && h.gross_score != null)
        .map((h: any) => ({
          golfer_id: priorSummaryInfo[h.summary_id].golfer_id,
          event_id: priorSummaryInfo[h.summary_id].event_id,
          hole: h.hole_number,
          gross: h.gross_score,
        }));
      const playerHistory = buildPlayerHistories({
        eventId,
        playerIds: players.map((p: any) => p.golferId),
        allEvents: completedEvts,
        allTotals: (leaderboard || [])
          .filter((r: any) => completedEvts.some((e: any) => e.event_id === r.event_id))
          .map((r: any) => ({ event_id: r.event_id, golfer_id: r.golfer_id, total: r.total_stableford_points })),
        priorHoleRows,
      });

      const standings = buildStandings(eventEntries, golfers);
      // Week label scoped to the season (the all-time event number reads as
      // "Week 264" after a few years).
      const seasonWeek = (events || []).filter((e: any) => e.status === "Completed" && e.season === event.season && e.date <= event.date).length || eventNumber;
      const generated = selectDataBeats({
        eventId,
        players: players.map((p: any) => ({ golferId: p.golferId, name: p.name })),
        scores,
        holePars: course?.hole_pars || [],
        finalStandings: standings.slice(0, 5),
        winnerName: standings[0]?.name || "",
        eventLabel: `Week ${seasonWeek || ""}`.trim(),
        history: history.filter((h: any) => h.event_id !== eventId),
        prevEventId: (recentEventIds || [])[0] ?? null,
        playerHistory,
      });
      if (cancelled) return;
      setBeats(generated);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(generated)); } catch (_: any) {}

      // Persist surfaced beats for future anti-repeat -- once per event.
      const already = history.some((h: any) => h.event_id === eventId);
      if (!already && generated.length > 0) {
        const histRows = generated.map((b) => ({
          event_id: eventId,
          angle_type: b.angle,
          protagonist_id: b.protagonistId,
          strength: b.strength,
        }));
        supabase.from("story_beats_history").insert(histRows).catch(reportWriteError("Highlight history save"));
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, hasHoleData]);

  const humanRows = useMemo(() => rows || [], [rows]);

  // Unified watch model: merged, sorted card array.
  const cards: RecapCard[] = useMemo(() => {
    const list: RecapCard[] = [
      ...beats.map((b) => ({
        kind: "data" as const,
        beat: b,
        // Opening beats ("Through N") are the cold open of the data story --
        // they must play before any per-hole card, so their sort key is 0
        // (after pre-round humans, before hole 1).
        hole: b.throughHole != null ? 0 : b.hole,
        preRound: false,
        isFinal: b.angle === "final",
        createdAt: null,
      })),
      ...humanRows.map((r: any) => ({
        kind: "human" as const,
        row: r,
        hole: r.hole_number ?? null,
        preRound: !!r.pre_round,
        isFinal: false,
        createdAt: r.created_at || null,
      })),
    ];
    list.sort(watchOrderCompare);
    return list;
  }, [beats, humanRows]);

  // Module visibility: hole-data events always show (they have beats); other
  // events only if someone uploaded to them. No empty state, no dangling "+".
  if (!hasHoleData && humanRows.length === 0) return null;

  // Rail declutter: >3 human highlights hides data tiles from the RAIL only;
  // the watch (viewer) always plays the full story.
  const humanCount = humanRows.length;
  const railCards = humanCount > 3 ? cards.filter((c) => c.kind === "human") : cards;

  const memberGolfer = memberGolferId != null ? golfers.find((g: any) => g.golfer_id === memberGolferId) : null;
  const memberName = memberGolfer ? `${memberGolfer.first_name} ${memberGolfer.last_name}` : null;

  const openViewerAt = (card: RecapCard) => setViewerIndex(Math.max(0, cards.indexOf(card)));

  const railTile = (card: RecapCard, i: number) => {
    if (card.kind === "human") {
      const r = card.row;
      const holeTxt = r.pre_round ? "Pre-round" : r.hole_number != null ? `#${r.hole_number}` : "Clubhouse";
      return (
        <div key={`h${r.id}`} className="story" onClick={() => openViewerAt(card)}>
          <div className="ring">
            <div className="ring-inner">
              <div className="thumb">
                <img src={r.thumb_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {r.media_type === "video" && (
                  <div className="badge-cnr vid"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></div>
                )}
              </div>
            </div>
          </div>
          <div className="story-name">{firstNameOf(r.golfer_name)} | {holeTxt}</div>
        </div>
      );
    }
    const b = card.beat!;
    const holeTxt = b.angle === "final" ? "Final" : b.hole != null ? `#${b.hole}` : "Round";
    const aerial = b.hole != null ? holeAerialUrl(holeImages, event.course_name, b.hole) : null;
    return (
      <div key={`d${i}-${b.angle}-${b.hole}`} className="story" onClick={() => openViewerAt(card)}>
        <div className="ring">
          <div className="ring-inner">
            <div className="thumb dataimg">
              {aerial ? <img src={aerial} alt="" loading="lazy" /> : <div className="thumb-fallback" />}
              {b.protagonistInitials ? (
                <div className="ovl">{b.protagonistInitials}</div>
              ) : (
                <div className="ovl"><span style={{ width: 30, height: 30, color: "var(--gold-300)", display: "flex" }}>{AUTO_ICON}</span></div>
              )}
            </div>
          </div>
        </div>
        <div className="story-name">{b.preview} | {holeTxt}</div>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="hl-head"><div className="hl-title">Highlights</div></div>
      <div className="hl-sub">Tap to watch</div>
      <div className="rail">
        <div className="story add" onClick={() => setAddOpen(true)}>
          <div className="ring"><div className="plus"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></div></div>
          <div className="story-name">Add</div>
        </div>
        {cards.length > 0 && (
          <div className="story cover" onClick={() => setViewerIndex(0)}>
            <div className="ring"><div className="ring-inner"><div className="cv"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></div></div></div>
            <div className="story-name">Watch</div>
          </div>
        )}
        {railCards.map(railTile)}
      </div>

      {viewerIndex != null && (
        <HighlightsViewer
          cards={cards}
          startIndex={viewerIndex}
          event={event}
          course={course}
          golfers={golfers}
          eventEntries={eventEntries}
          holeScores={holeScores}
          holeImages={holeImages}
          likes={likes}
          comments={comments}
          memberName={memberName}
          adminMode={adminMode}
          onClose={() => setViewerIndex(null)}
          onToggleLike={(highlightId: number) => {
            if (!memberName) { showToast("Pick your profile in Settings to like highlights"); return; }
            const mine = likes.find((l: any) => l.highlight_id === highlightId && l.liker_name === memberName);
            if (mine) {
              setLikes((prev) => prev.filter((l: any) => l !== mine));
              supabase.from("highlight_likes").delete({ highlight_id: highlightId, liker_name: mine.liker_name }).catch(reportWriteError("Unlike"));
            } else {
              setLikes((prev) => [...prev, { id: Date.now(), highlight_id: highlightId, liker_name: memberName }]);
              supabase.from("highlight_likes").insert({ highlight_id: highlightId, liker_name: memberName }).catch(reportWriteError("Like"));
            }
          }}
          onAddComment={async (highlightId: number, text: string) => {
            const name = memberName || "Anonymous";
            const temp = { id: Date.now(), highlight_id: highlightId, commenter_name: name, text, created_at: new Date().toISOString() };
            setComments((prev) => [...prev, temp]);
            try {
              const [inserted] = await supabase.from("highlight_comments").insert({ highlight_id: highlightId, commenter_name: name, text });
              if (inserted) setComments((prev) => prev.map((c: any) => (c === temp ? inserted : c)));
            } catch (e: any) {
              setComments((prev) => prev.filter((c: any) => c !== temp));
              reportWriteError("Comment")(e);
            }
          }}
          onHide={adminMode ? (highlightId: number) => {
            setRows((prev) => (prev || []).filter((r: any) => r.id !== highlightId));
            setViewerIndex(null);
            supabase.from("highlights").update({ hidden: true }, { id: highlightId }).catch(reportWriteError("Hide highlight"));
            showToast("Highlight hidden");
          } : undefined}
        />
      )}

      {addOpen && (
        <AddHighlightFlow
          event={event}
          golfers={golfers}
          eventEntries={eventEntries}
          memberName={memberName}
          onClose={() => setAddOpen(false)}
          onPosted={(row: any) => {
            setRows((prev) => [...(prev || []), row]);
            setAddOpen(false);
            showToast("Highlight posted");
          }}
        />
      )}

      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}

function firstNameOf(name: string): string {
  return (name || "").trim().split(" ")[0];
}

// Tie-aware standings rows ("1", "T2", "T2", "4"...) from event entries.
function buildStandings(eventEntries: any[], golfers: any[]): BeatStandingRow[] {
  const sorted = [...eventEntries].sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points);
  const rows: BeatStandingRow[] = [];
  let pos = 0, prevPts: number | null = null, prevPos = 0;
  sorted.forEach((e: any) => {
    pos += 1;
    const isTie = prevPts != null && e.total_stableford_points === prevPts;
    const effPos = isTie ? prevPos : pos;
    prevPos = effPos;
    prevPts = e.total_stableford_points;
    rows.push({ pos: String(effPos), name: shortName(golferName(golfers, e.golfer_id)), pts: e.total_stableford_points });
  });
  // Mark ties with T prefix.
  const posCounts: Record<string, number> = {};
  rows.forEach((r) => { posCounts[r.pos] = (posCounts[r.pos] || 0) + 1; });
  rows.forEach((r) => { if (posCounts[r.pos] > 1) r.pos = "T" + r.pos; });
  return rows;
}

function shortName(full: string): string {
  const parts = (full || "").trim().split(" ").filter(Boolean);
  if (parts.length < 2) return full;
  return parts[0] + " " + parts[parts.length - 1][0];
}
