import { useState, useEffect } from "react";
import { calcPlayingHandicap, calcHoleNetScore, calcStablefordPoints, calcHoleScores } from "../../lib/golfMath";
import { golferName, scrollMainTop, formatDate } from "../../lib/formatters";
import { ToggleGroup } from "../../App";

export function ScoreCorrection({ golfers, courses, events, leaderboard, setLeaderboard, holeScores, setHoleScores, dbUpsertLeaderboard, dbUpsertHoleScore, showSuccess }: any) {
  const [selEventId, setSelEventId] = useState("");
  const [selGolferId, setSelGolferId] = useState("");
  const [corrType, setCorrType] = useState("total");
  const [corrPts, setCorrPts] = useState("");
  const [corrCourseId, setCorrCourseId] = useState("");
  const [corrGross, setCorrGross] = useState<string[]>(Array(18).fill(""));

  // 2b: year filter
  const allSeasonsList = [...new Set(events.map((e: any) => e.season))].sort((a: any, b: any) => b - a) as number[];
  const [filterYear, setFilterYear] = useState<number>(allSeasonsList[0] || new Date().getFullYear());
  const filteredEvents = [...events].filter((e: any) => e.season === filterYear).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const selEvent = events.find((e: any) => e.event_id === parseInt(selEventId));
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

  const saveCorrection = () => {
    if (!entry) return;
    const pts = corrType === "hole" ? calcTotal : parseInt(corrPts);
    if (!pts) return;

    // 1. Update leaderboard state
    const updated = {
      ...entry,
      total_stableford_points: pts,
      entry_type: corrType === "hole" ? "Hole-by-Hole" : "Total Only",
      skins_paid: corrType === "hole",
    };
    setLeaderboard((p: any) =>
      p.map((r: any) => (r.summary_id === entry.summary_id ? updated : r))
    );
    // 2. Persist leaderboard row to DB
    dbUpsertLeaderboard(updated);

    if (corrType === "hole" && corrCourse && corrPhcp != null) {
      // 3. Build corrected hole score rows, reusing existing score_ids where possible
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

      // 4. Update hole scores state
      setHoleScores((p: any) => [
        ...p.filter((hs: any) => hs.summary_id !== entry.summary_id),
        ...newScores,
      ]);

      // 5. Persist each hole score to DB via upsert (on_conflict summary_id,hole_number)
      newScores.forEach((row: any) => dbUpsertHoleScore(row));
    }

    showSuccess(`Score corrected: ${golferName(golfers, parseInt(selGolferId))} -> ${pts} pts`);
    setTimeout(() => scrollMainTop(), 50);
  };

  const deleteEntry = () => {
    if (!entry) return;
    setLeaderboard((p: any) => p.filter((r: any) => r.summary_id !== entry.summary_id));
    setHoleScores((p: any) => p.filter((hs: any) => hs.summary_id !== entry.summary_id));
    setSelGolferId(""); showSuccess("Score entry deleted");
  };

  const ptsClass = (pts: number | null) => { if (pts === null || pts === undefined) return ""; if (pts >= 4) return "pts-eagle"; if (pts === 3) return "pts-birdie"; if (pts === 2) return "pts-par"; if (pts === 1) return "pts-bogey"; return "pts-zero"; };

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 8 }}>Score Correction</div>
      <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 14 }}>Select an event and golfer to correct their score. Only the current season is editable.</p>

      {/* 2b: Year filter -- only current year is editable */}
      <div className="form-group">
        <label className="form-label">Season</label>
        <select className="form-select" value={filterYear} onChange={e => { setFilterYear(parseInt(e.target.value)); setSelEventId(""); setSelGolferId(""); }}>
          {allSeasonsList.map(y => <option key={y} value={y}>{y} Season{y !== allSeasonsList[0] ? " (view only)" : ""}</option>)}
        </select>
      </div>
      {filterYear !== allSeasonsList[0] && (
        <div style={{ background: "var(--gold-50)", border: "1.5px solid var(--gold-300)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 13, color: "var(--gold-800)", marginBottom: 12 }}>
          ⚠ Past seasons are read-only. Switch to the current season to make edits.
        </div>
      )}

      <div className="form-group"><label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e => { setSelEventId(e.target.value); setSelGolferId(""); }}>
          <option value="">Select event…</option>
          {filteredEvents.map((ev: any) => <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
        </select>
      </div>
      {selEventId && (
        <div className="form-group"><label className="form-label">Golfer</label>
          <select className="form-select" value={selGolferId} onChange={e => setSelGolferId(e.target.value)}>
            <option value="">Select golfer…</option>
            {leaderboard.filter((r: any) => r.event_id === parseInt(selEventId)).map((r: any) => {
              const g = golfers.find((x: any) => x.golfer_id === r.golfer_id);
              return <option key={r.golfer_id} value={r.golfer_id}>{g ? `${g.first_name} ${g.last_name}` : "Unknown"} -- {r.total_stableford_points} pts ({r.entry_type})</option>;
            })}
          </select>
        </div>
      )}
      {entry && (
        <>
          <div className="card" style={{ padding: "10px 14px", marginBottom: 12 }}>
            <div className="info-row"><span className="info-key">Current Score</span><span className="info-val" style={{ fontWeight: 700, fontSize: 18, color: "var(--green-700)" }}>{entry.total_stableford_points} pts</span></div>
            <div className="info-row"><span className="info-key">Entry Type</span><span className="info-val">{entry.entry_type}</span></div>
          </div>
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
            <div className="form-group"><label className="form-label">Corrected Points</label><input className="form-input" type="number" min="0" max="72" value={corrPts} onChange={e => setCorrPts(e.target.value)} /></div>
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
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveCorrection} disabled={filterYear !== allSeasonsList[0]}>Save Correction</button>
            <button className="btn btn-danger" onClick={deleteEntry} disabled={filterYear !== allSeasonsList[0]}>Delete</button>
          </div>
        </>
      )}
    </div>
  );
}
