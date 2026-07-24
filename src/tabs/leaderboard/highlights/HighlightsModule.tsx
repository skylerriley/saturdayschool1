// Event Highlights module (admin-gated v1).
// Mounts on the completed-event detail overlay between the skins card and the
// leaderboard. Renders a horizontal story rail; opens the full-screen story
// viewer (HighlightsViewer) and the add-highlight flow (AddHighlightFlow).
//
// Data model: human moments persist in the `highlights` table (media on R2);
// auto data beats are regenerated on read from hole scores via
// src/lib/recapEngine.ts and are never stored.
//
// READS ARE PURE. This module NEVER writes story_beats_history -- those rows
// are sequence state authored solely by the chronological rebuild
// (src/lib/rebuildBeatHistory.ts, run from Admin > Events and on scoring
// finalization). See the invariant comment in the beat-generation effect.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, reportWriteError } from "../../../lib/supabaseClient";
import { golferName } from "../../../lib/formatters";
import { selectDataBeats, watchOrderCompare, type DataBeat } from "../../../lib/recapEngine";
import { buildBeatsInput, hasHoleByHoleData, ANTI_REPEAT_WINDOW, beatsCacheKey } from "../../../lib/buildBeatsInput";
import { holeAerialUrl, type RecapCard } from "./highlightsShared";
import { HighlightsViewer } from "./HighlightsViewer";
import { AddHighlightFlow } from "./AddHighlightFlow";

const AUTO_ICON = (
  <svg viewBox="0 0 24 24" style={{ width: "100%", height: "100%", fill: "currentColor" }}>
    <path d="M4 20V6l7 4 9-6v14l-9 5-7-4z" />
  </svg>
);

export function HighlightsModule({ event, course, courses, signups, golfers, eventEntries, holeScores, holeImages, memberGolferId, adminMode, eventNumber, recentEventIds, leaderboard, events, eventOdds }: any) {
  const eventId = event.event_id;

  // Hard gate for auto beats: same predicate the skins card uses -- every
  // leaderboard entry must be Hole-by-Hole. Otherwise zero data beats.
  const hasHoleData = hasHoleByHoleData(eventEntries);

  const [rows, setRows] = useState<any[] | null>(null); // null = loading
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  // highlight_views rows for this event -- powers the admin/uploader "Seen by"
  // chip. Pure analytics: never feeds beat selection. Loaded behind the same
  // admin gate as everything else in this module.
  const [views, setViews] = useState<any[]>([]);
  const [beats, setBeats] = useState<DataBeat[]>([]);
  // This event's story_beats_history rows -- carries the admin `hidden` flag
  // and `caption_override` applied at display time.
  const [beatHistory, setBeatHistory] = useState<any[]>([]);
  // Bumped after an admin hide so the story recomposes immediately (the
  // hidden angle is filtered BEFORE composition; the next-best candidate
  // fills the slot instead of leaving a gap).
  const [beatsNonce, setBeatsNonce] = useState(0);
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
      // Views are scoped by event_id (auto beats have no highlight_id, so they
      // can't be joined through the highlights list) and loaded independently:
      // an event with zero human highlights can still have viewed auto beats.
      // Wrapped separately so a missing highlight_views table (pre-migration)
      // never blanks the highlights themselves.
      try {
        const vw = await supabase.from("highlight_views").select("*", `&event_id=eq.${eventId}`);
        if (!cancelled) setViews(vw);
      } catch (_: any) {
        if (!cancelled) setViews([]);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  // Generate data beats (win-prob replay path). The Monte Carlo is seeded on
  // event_id inside the engine, so beats are deterministic across sessions;
  // the sessionStorage cache is purely an instant-reopen optimization.
  useEffect(() => {
    if (!hasHoleData) { setBeats([]); return; }
    const cacheKey = beatsCacheKey(eventId);

    let cancelled = false;
    (async () => {
      // Anti-repeat window: the 6 completed events immediately PRECEDING this
      // one by date, plus this event (for hidden flags / caption overrides).
      // Derived from dates here rather than the recentEventIds prop, which is
      // the globally-newest events -- wrong for a mid-season event, and the
      // window must match the rebuild's chronology exactly or the same event
      // would compose differently depending on where it sits in the season.
      const priorByDate = (events || [])
        .filter((e: any) => e.status === "Completed" && e.date < event.date)
        .sort((a: any, b: any) => b.date.localeCompare(a.date)); // most recent first
      const windowIds = priorByDate.slice(0, ANTI_REPEAT_WINDOW).map((e: any) => e.event_id);
      let history: any[] = [];
      const histIds = [...windowIds, eventId];
      try {
        history = await supabase.from("story_beats_history").select("*", `&event_id=in.(${histIds.join(",")})`);
      } catch (_: any) {}
      if (cancelled) return;
      setBeatHistory(history.filter((h: any) => h.event_id === eventId));

      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) { setBeats(JSON.parse(cached)); return; }
      } catch (_: any) {}

      // Week label scoped to the season (the all-time event number reads as
      // "Week 264" after a few years).
      const seasonWeek = (events || []).filter((e: any) => e.status === "Completed" && e.season === event.season && e.date <= event.date).length || eventNumber;
      // Same builder the rebuild uses -- read and write CANNOT drift.
      const generated = selectDataBeats(buildBeatsInput({
        event, course, courses, signups, golfers, eventEntries, holeScores,
        leaderboard, events, eventOdds,
        eventLabel: `Week ${seasonWeek || ""}`.trim(),
        historyRows: history,
        hiddenRows: history,
        golferName,
      }));
      if (cancelled) return;
      setBeats(generated);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(generated)); } catch (_: any) {}

      // INVARIANT: A READ NEVER WRITES story_beats_history.
      // Beats are a pure function of (event data + stored history). The
      // history rows are authored ONLY by the chronological rebuild
      // (rebuildBeatHistory in src/lib/rebuildBeatHistory.ts, run from Admin
      // and on scoring finalization). Persisting here would make the story a
      // side effect of who viewed what in which order: a viewer opening the
      // newest event first finds no rows for events N-1..N-6, so the
      // anti-repeat never engages and every event is composed as if it were
      // the first ever played -- measured at 6/7 events telling a different
      // story by viewing order, with wildcard firing 7/7 instead of 2/7.
      // Do not reintroduce a write here.
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, hasHoleData, beatsNonce]);

  const humanRows = useMemo(() => rows || [], [rows]);

  // Hidden beats filtered (belt-and-braces for cached beats -- generation
  // already filters pre-composition) and admin caption overrides applied.
  const displayBeats = useMemo(() => {
    const match = (h: any, b: DataBeat) => h.angle_type === b.angle;
    return beats
      .filter((b) => !beatHistory.some((h: any) => h.hidden === true && match(h, b)))
      .map((b) => {
        const o = beatHistory.find((h: any) => h.caption_override && match(h, b));
        return o ? { ...b, caption: [{ t: o.caption_override }] } : b;
      });
  }, [beats, beatHistory]);

  // Unified watch model: merged, sorted card array.
  const cards: RecapCard[] = useMemo(() => {
    const list: RecapCard[] = [
      ...displayBeats.map((b) => ({
        kind: "data" as const,
        beat: b,
        // Chronological order (Handoff #8): every data beat sorts on the hole
        // where its story RESOLVES, computed by the composer (resolutionHole).
        // The opening is NO LONGER pinned to the front -- a race-state beat
        // detected at hole 9 plays after an eagle on 4, so the story never
        // jumps backwards. Fall back to throughHole/hole for any cached beat
        // written before resolutionHole existed (an opening -> its throughHole,
        // a whole-round beat -> end via watchOrderCompare's null handling).
        hole: b.resolutionHole ?? b.throughHole ?? b.hole,
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
  }, [displayBeats, humanRows]);

  // ---- admin/owner actions from the viewer's dots menu ----------------------
  const bustBeatCache = () => { try { sessionStorage.removeItem(beatsCacheKey(eventId)); } catch (_: any) {} };
  const histRowFor = (b: DataBeat) => beatHistory.find((h: any) => h.angle_type === b.angle);

  const hideBeat = async (b: DataBeat) => {
    try {
      const row = histRowFor(b);
      if (row) {
        await supabase.from("story_beats_history").update({ hidden: true }, { id: row.id });
      } else {
        await supabase.from("story_beats_history").insert({
          event_id: eventId, angle_type: b.angle, protagonist_id: b.protagonistId, strength: b.strength, hidden: true,
        });
      }
    } catch (e: any) { reportWriteError("Hide beat")(e); }
    // Recompose from scratch so the next-best candidate fills the slot.
    bustBeatCache();
    setViewerIndex(null);
    setBeatsNonce((n) => n + 1);
    showToast("Beat hidden");
  };

  const editBeatCaption = async (b: DataBeat, text: string) => {
    const val = text === "" ? null : text;
    try {
      const row = histRowFor(b);
      if (row) {
        await supabase.from("story_beats_history").update({ caption_override: val }, { id: row.id });
        setBeatHistory((prev) => prev.map((h: any) => (h.id === row.id ? { ...h, caption_override: val } : h)));
      } else if (val) {
        const inserted = await supabase.from("story_beats_history").insert({
          event_id: eventId, angle_type: b.angle, protagonist_id: b.protagonistId, strength: b.strength, caption_override: val,
        });
        const ir = Array.isArray(inserted) ? inserted[0] : null;
        setBeatHistory((prev) => [...prev, ir || { id: Date.now(), event_id: eventId, angle_type: b.angle, protagonist_id: b.protagonistId, caption_override: val }]);
      }
      showToast(val ? "Caption updated" : "Caption restored");
    } catch (e: any) { reportWriteError("Edit beat caption")(e); }
  };

  const deleteHighlight = (highlightId: number) => {
    setRows((prev) => (prev || []).filter((r: any) => r.id !== highlightId));
    setViewerIndex(null);
    supabase.from("highlights").update({ hidden: true }, { id: highlightId }).catch(reportWriteError("Delete highlight"));
    showToast("Highlight deleted");
  };

  const editHighlightCaption = (row: any, text: string) => {
    const caption = text === "" ? null : text;
    setRows((prev) => (prev || []).map((r: any) => (r.id === row.id ? { ...r, caption } : r)));
    supabase.from("highlights").update({ caption }, { id: row.id }).catch(reportWriteError("Edit highlight"));
    showToast("Caption updated");
  };

  // Re-attribute a highlight (wrong golfer / wrong hole on upload). The watch
  // order re-sorts automatically since cards derive from rows.
  const editHighlightDetails = (row: any, patch: { golfer_name: string; hole_number: number | null; pre_round: boolean }) => {
    setRows((prev) => (prev || []).map((r: any) => (r.id === row.id ? { ...r, ...patch } : r)));
    supabase.from("highlights").update(patch, { id: row.id }).catch(reportWriteError("Edit highlight"));
    showToast("Highlight updated");
  };

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
                {/* Video thumbnails show the plain poster image, same as photo
                    highlights -- no play-icon overlay on the rail. */}
                <img src={r.thumb_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
          courses={courses}
          signups={signups}
          golfers={golfers}
          eventEntries={eventEntries}
          holeScores={holeScores}
          holeImages={holeImages}
          likes={likes}
          comments={comments}
          views={views}
          memberName={memberName}
          adminMode={adminMode}
          onClose={() => setViewerIndex(null)}
          onView={(v: any) => {
            // Fire-and-forget analytics write. NEVER awaited on the render path
            // and silent on failure -- a failed insert (or a missing table
            // pre-migration) must not affect what renders. The DB unique index
            // on (beat_key, viewer_name) makes a duplicate insert a harmless
            // no-op, so no read-before-write is needed. Optimistically reflect
            // the view locally so the "Seen by" count updates without a refetch.
            setViews((prev) => (prev.some((x: any) => x.beat_key === v.beatKey && x.viewer_name === v.viewerName)
              ? prev
              : [...prev, { id: Date.now(), beat_key: v.beatKey, event_id: v.eventId, highlight_id: v.highlightId, angle_type: v.angleType, viewer_name: v.viewerName, viewed_at: new Date().toISOString() }]));
            try {
              supabase.from("highlight_views").insert({
                beat_key: v.beatKey,
                event_id: v.eventId,
                highlight_id: v.highlightId,
                angle_type: v.angleType,
                viewer_name: v.viewerName,
              }).catch((_: any) => {});
            } catch (_: any) {}
          }}
          onHideBeat={adminMode ? hideBeat : undefined}
          onEditBeatCaption={adminMode ? editBeatCaption : undefined}
          onDeleteHighlight={deleteHighlight}
          onEditHighlightCaption={editHighlightCaption}
          onEditHighlightDetails={editHighlightDetails}
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
        />
      )}

      {addOpen && (
        <AddHighlightFlow
          event={event}
          course={course}
          courses={courses}
          signups={signups}
          golfers={golfers}
          eventEntries={eventEntries}
          holeScores={holeScores}
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
