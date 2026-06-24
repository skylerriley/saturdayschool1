import { useState, useEffect } from "react";
import { calcPlayingHandicap, calcHoleNetScore, calcStablefordPoints, calcHoleScores } from "../../lib/golfMath";
import { golferName, scrollMainTop, formatDate } from "../../lib/formatters";
import { ToggleGroup } from "../../App";

// Compute payout/skins implications given the leaderboard for a single event
function calcEventImplications(eventId: number, lbRows: any[], golfers: any[]) {
  const paidRows = [...lbRows.filter((r: any) => r.event_id === eventId && r.buy_in_paid)]
    .sort((a: any, b: any) => b.total_stableford_points - a.total_stableford_points);
  if (!paidRows.length) return null;
  const pot = paidRows.length * 20;
  const topPts = paidRows[0].total_stableford_points;
  const tied1st = paidRows.filter((r: any) => r.total_stableford_points === topPts);
  const secondPts = tied1st.length === 1 && paidRows.length > 1 ? paidRows[1]?.total_stableford_points : null;
  const tied2nd = secondPts != null ? paidRows.filter((r: any) => r.total_stableford_points === secondPts) : [];
  const payouts: { name: string; pos: string; amount: number }[] = [];
  tied1st.forEach((r: any) => {
    const g = golfers.find((x: any) => x.golfer_id === r.golfer_id);
    const name = g ? `${g.first_name} ${g.last_name}` : "Unknown";
    const amount = tied1st.length === 1 ? pot * (2 / 3) : pot / tied1st.length;
    payouts.push({ name, pos: tied1st.length > 1 ? "1st (tied)" : "1st", amount });
  });
  tied2nd.forEach((r: any) => {
    const g = golfers.find((x: any) => x.golfer_id === r.golfer_id);
    const name = g ? `${g.first_name} ${g.last_name}` : "Unknown";
    payouts.push({ name, pos: "2nd", amount: (pot * (1 / 3)) / tied2nd.length });
  });
  // Skins: hole-by-hole entries only — lowest net on each hole wins
  const hbhRows = lbRows.filter((r: any) => r.event_id === eventId && r.entry_type === "Hole-by-Hole" && r.skins_paid);
  return { pot, payouts, skinEligible: hbhRows.length, totalPlayers: paidRows.length };
}

export function ScoreCorrection({ golfers, courses, events, leaderboard, setLeaderboard, holeScores, setHoleScores, dbUpsertLeaderboard, dbUpsertHoleScore, showSuccess }: any) {
  const [selEventId, setSelEventId] = useState("");
  const [selGolferId, setSelGolferId] = useState("");
  const [corrType, setCorrType] = useState("total");
  const [corrPts, setCorrPts] = useState("");
  const [corrCourseId, setCorrCourseId] = useState("");
  const [corrGross, setCorrGross] = useState<string[]>(Array(18).fill(""));
  // Implications popup state
  const [implications, setImplications] = useState<any | null>(null);
  const [pendingAction, setPendingAction] = useState<null | "save" | "delete">(null);
  // Add-golfer mode for completed events
  const [addingNew, setAddingNew] = useState(false);

  // 2b: year filter
  const allSeasonsList = [...new Set(events.map((e: any) => e.season))].sort((a: any, b: any) => b - a) as number[];
  const [filterYear, setFilterYear] = useState<number>(allSeasonsList[0] || new Date().getFullYear());
  // Include all events for correction (active + completed)
  const filteredEvents = [...events].filter((e: any) => e.season === filterYear).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const selEvent = events.find((e: any) => e.event_id === parseInt(selEventId));
  const isCompletedEvent = selEvent?.status === "Completed";
  const entry = leaderboard.find((r: any) => r.event_id === parseInt(selEventId) && r.golfer_id === parseInt(selGolferId));
  const existingHbh = entry?.entry_type === "Hole-by-Hole" ? holeScores.filter((hs: any) => hs.summary_id === entry.summary_id).sort((a: any, b: any) => a.hole_number - b.hole_number) : [];
  const availTees = selEvent ? courses.filter((c: any) => c.course_name === selEvent.course_name) : [];
  const corrCourse = courses.find((c: any) => c.course_id === parseInt(corrCourseId));
  const corrGolfer = golfers.find((g: any) => g.golfer_id === parseInt(selGolferId));
  const corrPhcp = corrGolfer && corrCourse ? calcPlayingHandicap(corrGolfer.current_handicap_index, corrCourse.tee_slope, corrCourse.tee_rating, corrCourse.par) : null;
  const holeCalcs = corrCourse && corrType === "hole" && corrPhcp != null ? calcHoleScores(corrGross, corrPhcp, corrCourse) : [];
  const calcTotal = holeCalcs.reduce((s: number, h: any) => s + (h.points ?? 0), 0);

  useEffect(() => {
    if (!entry) return;
    setCorrType(entry.entry_type === "Hole-by-Hole" ? "hole" : "total");
    setCorrPts(String(entry.total_stableford_points));
    if (existingHbh.length > 0) {
      const arr = Array(18).fill("");
      existingHbh.forEach((hs: any) => { arr[hs.hole_number - 1] = String(hs.gross_score); });
      setCorrGross(arr);
    } else { setCorrGross(Array(18).fill("")); }
  }, [selEventId, selGolferId]);

  const performSaveCorrection = () => {
    if (!entry) return;
    const pts = corrType === "hole" ? calcTotal : parseInt(corrPts);
    if (!pts) return;

    const updated = {
      ...entry,
      total_stableford_points: pts,
      entry_type: corrType === "hole" ? "Hole-by-Hole" : "Total Only",
      skins_paid: corrType === "hole",
    };
    setLeaderboard((p: any) =>
      p.map((r: any) => (r.summary_id === entry.summary_id ? updated : r))
    );
    dbUpsertLeaderboard(updated);

    if (corrType === "hole" && corrCourse && corrPhcp != null) {
      const newScores = corrGross
        .map((v: string, i: number) => {
          if (!v) return null;
          const existing = existingHbh.find((hs: any) => hs.hole_number === i + 1);
          const net = calcHoleNetScore(parseInt(v), corrPhcp, corrCourse.hole_stroke_indices[i]);
          return {
            score_id: existing ? existing.score_id : Date.now() + i,
            summary_id: entry.summary_id,
            hole_number: i + 1,
            gross_score: parseInt(v),
            net_score: net,
            stableford_points: calcStablefordPoints(net, corrCourse.hole_pars[i]),
          };
        })
        .filter(Boolean);
      setHoleScores((p: any) => [
        ...p.filter((hs: any) => hs.summary_id !== entry.summary_id),
        ...newScores,
      ]);
      newScores.forEach((row: any) => dbUpsertHoleScore(row));
    }

    showSuccess(`Score corrected: ${golferName(golfers, parseInt(selGolferId))} -> ${pts} pts`);
    setTimeout(() => scrollMainTop(), 50);
  };

  const performDeleteEntry = () => {
    if (!entry) return;
    setLeaderboard((p: any) => p.filter((r: any) => r.summary_id !== entry.summary_id));
    setHoleScores((p: any) => p.filter((hs: any) => hs.summary_id !== entry.summary_id));
    setSelGolferId("");
    showSuccess("Score entry deleted");
  };

  // Build simulated leaderboard after change to show implications
  const buildImplicationsAndConfirm = (action: "save" | "delete") => {
    const eid = parseInt(selEventId);
    let simLb = [...leaderboard];
    if (action === "save" && entry) {
      const pts = corrType === "hole" ? calcTotal : parseInt(corrPts);
      if (!pts) return;
      const updated = { ...entry, total_stableford_points: pts, entry_type: corrType === "hole" ? "Hole-by-Hole" : "Total Only", skins_paid: corrType === "hole" };
      simLb = simLb.map((r: any) => r.summary_id === entry.summary_id ? updated : r);
    } else if (action === "delete" && entry) {
      simLb = simLb.filter((r: any) => r.summary_id !== entry.summary_id);
    }
    const before = calcEventImplications(eid, leaderboard, golfers);
    const after = calcEventImplications(eid, simLb, golfers);
    setImplications({ before, after, action });
    setPendingAction(action);
  };

  const saveCorrection = () => buildImplicationsAndConfirm("save");
  const deleteEntry = () => buildImplicationsAndConfirm("delete");

  const confirmAction = () => {
    if (pendingAction === "save") performSaveCorrection();
    else if (pendingAction === "delete") performDeleteEntry();
  };

  // Save a brand-new golfer entry for a completed event
  const saveNewEntry = () => {
    if (!selGolferId || !selEventId) return;
    const pts = corrType === "hole" ? calcTotal : parseInt(corrPts);
    if (!pts) return;
    const eid = parseInt(selEventId);
    const gid = parseInt(selGolferId);
    const newSid = Date.now() + gid;
    const newEntry: any = {
      summary_id: newSid,
      event_id: eid,
      golfer_id: gid,
      season: selEvent?.season || new Date().getFullYear(),
      entry_type: corrType === "hole" ? "Hole-by-Hole" : "Total Only",
      total_stableford_points: pts,
      buy_in_paid: true,
      skins_paid: corrType === "hole",
      charity_paid: true,
      weekly_payout_won: 0,
      skins_payout_won: 0,
    };

    // Show implications before saving
    const simLb = [...leaderboard, newEntry];
    const before = calcEventImplications(eid, leaderboard, golfers);
    const after = calcEventImplications(eid, simLb, golfers);
    setImplications({ before, after, action: "add", newEntry, newGross: corrType === "hole" && corrCourse && corrPhcp != null ? corrGross : null });
    setPendingAction("save");
  };

  const confirmNewEntry = (newEntry: any, newGross: string[] | null) => {
    dbUpsertLeaderboard(newEntry);
    setLeaderboard((p: any) => [...p, newEntry]);
    if (corrType === "hole" && corrCourse && corrPhcp != null && newGross) {
      const newScores = newGross.map((v: string, i: number) => {
        if (!v) return null;
        const net = calcHoleNetScore(parseInt(v), corrPhcp, corrCourse.hole_stroke_indices[i]);
        return {
          score_id: newEntry.summary_id * 100 + i,
          summary_id: newEntry.summary_id,
          hole_number: i + 1,
          gross_score: parseInt(v),
          net_score: net,
          stableford_points: calcStablefordPoints(net, corrCourse.hole_pars[i]),
        };
      }).filter(Boolean);
      setHoleScores((p: any) => [...p, ...newScores]);
      newScores.forEach((row: any) => dbUpsertHoleScore(row));
    }
    showSuccess(`Added ${golferName(golfers, newEntry.golfer_id)} to event`);
    setAddingNew(false);
    setSelGolferId("");
    setCorrGross(Array(18).fill(""));
    setCorrPts("");
    setTimeout(() => scrollMainTop(), 50);
  };

  const ptsClass = (pts: number | null) => { if (pts === null || pts === undefined) return ""; if (pts >= 4) return "pts-eagle"; if (pts === 3) return "pts-birdie"; if (pts === 2) return "pts-par"; if (pts === 1) return "pts-bogey"; return "pts-zero"; };

  // Golfers not yet in the event (for add-new mode)
  const existingGolferIds = new Set(leaderboard.filter((r: any) => r.event_id === parseInt(selEventId)).map((r: any) => r.golfer_id));
  const availableToAdd = golfers.filter((g: any) => g.status === "Active" && !existingGolferIds.has(g.golfer_id));

  const scoreFormJSX = (isNew: boolean) => (
    <>
      <ToggleGroup
        options={[{ value: "total", label: "Total Only" }, { value: "hole", label: "Hole by Hole" }]}
        value={corrType}
        onChange={setCorrType}
        style={{ marginBottom: 12 }}
      />
      {corrType === "hole" && (
        <div className="form-group"><label className="form-label">Tee Box (for recalc)</label>
          <select className="form-select" value={corrCourseId} onChange={e => setCorrCourseId(e.target.value)}>
            <option value="">Select tee…</option>
            {availTees.map((t: any) => <option key={t.course_id} value={t.course_id}>{t.tee_box_name} -- Slope {t.tee_slope}</option>)}
          </select>
        </div>
      )}
      {corrType === "total" ? (
        <div className="form-group"><label className="form-label">{isNew ? "Stableford Points" : "Corrected Points"}</label><input className="form-input" type="number" min="0" max="72" value={corrPts} onChange={e => setCorrPts(e.target.value)} /></div>
      ) : (corrCourse && (
        <div className="score-grid" style={{ marginBottom: 12 }}>
          <table className="score-table">
            <thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>Gross</th><th>Pts</th></tr></thead>
            <tbody>
              {Array.from({ length: 18 }, (_, i) => {
                const h = holeCalcs[i] || {} as { points?: number | null };
                return (<tr key={i}>
                  <td style={{ fontWeight: 600 }}>{i + 1}</td>
                  <td>{corrCourse.hole_pars[i]}</td>
                  <td style={{ color: "var(--text-muted)" }}>{corrCourse.hole_stroke_indices[i]}</td>
                  <td className="score-input-cell"><input type="number" min="1" max="15" inputMode="numeric" value={corrGross[i]} onChange={e => { const v = [...corrGross]; v[i] = e.target.value; setCorrGross(v); }} /></td>
                  <td className={ptsClass(h.points)} style={{ fontWeight: h.points != null ? 700 : 400 }}>{h.points != null ? h.points : ""}</td>
                </tr>);
              })}
              <tr style={{ background: "var(--green-50)" }}><td colSpan={3} style={{ fontWeight: 700, textAlign: "left", paddingLeft: 8, fontSize: 13 }}>Total Pts</td><td /><td style={{ fontWeight: 700, fontSize: 16, color: "var(--green-700)" }}>{calcTotal || ""}</td></tr>
            </tbody>
          </table>
        </div>
      ))}
    </>
  );

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 8 }}>Score Correction</div>
      <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 14 }}>Correct a score or add a missing golfer to any event.</p>

      {/* Year filter */}
      <div className="form-group">
        <label className="form-label">Season</label>
        <select className="form-select" value={filterYear} onChange={e => { setFilterYear(parseInt(e.target.value)); setSelEventId(""); setSelGolferId(""); setAddingNew(false); }}>
          {allSeasonsList.map(y => <option key={y} value={y}>{y} Season{y !== allSeasonsList[0] ? " (view only)" : ""}</option>)}
        </select>
      </div>
      {filterYear !== allSeasonsList[0] && (
        <div style={{ background: "var(--gold-50)", border: "1.5px solid var(--gold-300)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 13, color: "var(--gold-800)", marginBottom: 12 }}>
          ⚠ Past seasons are read-only. Switch to the current season to make edits.
        </div>
      )}

      <div className="form-group"><label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e => { setSelEventId(e.target.value); setSelGolferId(""); setAddingNew(false); }}>
          <option value="">Select event…</option>
          {filteredEvents.map((ev: any) => <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}{ev.status === "Completed" ? " ✓" : ""}</option>)}
        </select>
      </div>

      {selEventId && !addingNew && (
        <>
          <div className="form-group"><label className="form-label">Golfer</label>
            <select className="form-select" value={selGolferId} onChange={e => setSelGolferId(e.target.value)}>
              <option value="">Select golfer…</option>
              {leaderboard.filter((r: any) => r.event_id === parseInt(selEventId)).map((r: any) => {
                const g = golfers.find((x: any) => x.golfer_id === r.golfer_id);
                return <option key={r.golfer_id} value={r.golfer_id}>{g ? `${g.first_name} ${g.last_name}` : "Unknown"} -- {r.total_stableford_points} pts ({r.entry_type})</option>;
              })}
            </select>
          </div>
          {/* Add missing golfer button for completed events */}
          {isCompletedEvent && availableToAdd.length > 0 && filterYear === allSeasonsList[0] && (
            <button className="btn btn-outline btn-full" style={{ marginBottom: 12 }} onClick={() => { setAddingNew(true); setSelGolferId(""); setCorrGross(Array(18).fill("")); setCorrPts(""); setCorrType("total"); }}>
              + Add Missing Golfer to This Event
            </button>
          )}
        </>
      )}

      {/* ── Add new golfer to completed event ── */}
      {selEventId && addingNew && (
        <div className="card" style={{ padding: "14px", marginBottom: 12, borderColor: "var(--green-400)", borderWidth: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green-700)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Add Missing Golfer</div>
          <div className="form-group"><label className="form-label">Golfer</label>
            <select className="form-select" value={selGolferId} onChange={e => setSelGolferId(e.target.value)}>
              <option value="">Select golfer…</option>
              {availableToAdd.map((g: any) => <option key={g.golfer_id} value={g.golfer_id}>{g.first_name} {g.last_name}</option>)}
            </select>
          </div>
          {selGolferId && scoreFormJSX(true)}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveNewEntry} disabled={!selGolferId}>Add Golfer + Save</button>
            <button className="btn btn-outline" onClick={() => { setAddingNew(false); setSelGolferId(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Existing golfer correction ── */}
      {entry && !addingNew && (
        <>
          <div className="card" style={{ padding: "10px 14px", marginBottom: 12 }}>
            <div className="info-row"><span className="info-key">Current Score</span><span className="info-val" style={{ fontWeight: 700, fontSize: 18, color: "var(--green-700)" }}>{entry.total_stableford_points} pts</span></div>
            <div className="info-row"><span className="info-key">Entry Type</span><span className="info-val">{entry.entry_type}</span></div>
          </div>
          {scoreFormJSX(false)}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveCorrection} disabled={filterYear !== allSeasonsList[0]}>Save Correction</button>
            <button className="btn btn-danger" onClick={deleteEntry} disabled={filterYear !== allSeasonsList[0]}>Delete</button>
          </div>
        </>
      )}

      {/* ── Implications popup ── */}
      {implications && (
        <div className="modal-overlay" onClick={() => { setImplications(null); setPendingAction(null); }}>
          <div className="modal-sheet" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              {implications.action === "delete" ? "⚠ Delete Score — Implications" : implications.action === "add" ? "Review: Adding Golfer" : "Review: Score Change"}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
              This change will affect payouts and skins for this event. Review below before confirming.
            </div>

            {/* Skins eligibility */}
            {implications.before && implications.after && implications.before.skinEligible !== implications.after.skinEligible && (
              <div style={{ background: "var(--gold-50)", border: "1.5px solid var(--gold-300)", borderRadius: "var(--radius-sm)", padding: "8px 12px", marginBottom: 10, fontSize: 13, color: "var(--gold-800)" }}>
                ⛳ Skins eligible players: {implications.before.skinEligible} → {implications.after.skinEligible}
                {implications.after.skinEligible === 0 ? " — skins pool will be cancelled" : ""}
              </div>
            )}

            {/* Payout comparison */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Payouts After Change</div>
            {implications.after?.payouts?.length ? (
              <div style={{ marginBottom: 12 }}>
                {implications.after.payouts.map((p: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                    <span style={{ fontWeight: 600 }}>{p.pos} — {p.name}</span>
                    <span style={{ fontWeight: 700, color: "var(--green-700)" }}>${p.amount.toFixed(0)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, color: "var(--text-muted)" }}>
                  <span>Pot ({implications.after.totalPlayers} players × $20)</span>
                  <span>${implications.after.pot}</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>No paid entries remain.</div>
            )}

            {/* Previous payouts for comparison */}
            {implications.before?.payouts?.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Previous Payouts</div>
                <div style={{ marginBottom: 14, opacity: 0.65 }}>
                  {implications.before.payouts.map((p: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                      <span>{p.pos} — {p.name}</span>
                      <span>${p.amount.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className={implications.action === "delete" ? "btn btn-danger" : "btn btn-primary"}
                style={{ flex: 1 }}
                onClick={() => {
                  if (implications.action === "add") {
                    confirmNewEntry(implications.newEntry, implications.newGross);
                  } else {
                    confirmAction();
                  }
                  setImplications(null);
                  setPendingAction(null);
                }}
              >
                {implications.action === "delete" ? "Confirm Delete" : "Confirm Save"}
              </button>
              <button className="btn btn-outline" onClick={() => { setImplications(null); setPendingAction(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
