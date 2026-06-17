import { useState, useEffect, useRef } from "react";
import { runPairingEngine } from "../../lib/golfMath";
import { golferName, formatDate } from "../../lib/formatters";
import { supabase } from "../../lib/supabaseClient";

export function PairingDashboard({ golfers, courses, events, setEvents, signups, setSignups, showSuccess, scrollToTop }: any) {
  const pairingsRef = useRef<HTMLDivElement>(null);
  const [selEventId, setSelEventId] = useState(events.find((e: any) => e.status !== "Completed")?.event_id || "");
  const [pairings, setPairings] = useState<any[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  // 3e) Drag/move state: track which player is being moved
  const [moving, setMoving] = useState<{ gid: number, fromGroup: number } | null>(null);

  const selEvent = events.find((e: any) => e.event_id === parseInt(selEventId));
  const eventSignups = selEvent ? signups.filter((s: any) => s.event_id === selEvent.event_id && s.attending === "Yes") : [];
  const waitingRoomAdmin = eventSignups.filter((s: any) => s.in_waiting_room);
  const confirmedInGroups = eventSignups.filter((s: any) => !s.in_waiting_room);

  // Load existing confirmed pairings into local state for editing
  useEffect(() => {
    if (!selEvent || selEvent.status !== "Pairings Set") return;
    const grouped: Record<string, number[]> = {};
    eventSignups.forEach((s: any) => {
      if (!s.assigned_tee_time) return;
      (grouped[s.assigned_tee_time] = grouped[s.assigned_tee_time] || []).push(s.golfer_id);
    });
    const loaded = Object.entries(grouped).map(([teeTime, players]) => ({ teeTime, players }));
    if (loaded.length > 0) { setPairings(loaded); setConfirmed(true); }
  }, [selEventId]);

  const runPairings = () => {
    // Only pair confirmed players — waiting room players stay in waiting room
    const a = confirmedInGroups.map((s: any) => ({ golfer_id: s.golfer_id, sponsor_golfer_id: s.sponsor_golfer_id, early_tee_request: !!s.early_tee_request }));
    setPairings(runPairingEngine(a, selEvent.tee_times));
    setConfirmed(false); setMoving(null);
    setTimeout(() => pairingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  // 3e) Move a player to a different group
  const movePlayer = (gid: number, fromGroup: number, toGroup: number) => {
    if (!pairings) return;
    setPairings(prev => {
      const next = prev!.map(g => ({ ...g, players: [...g.players] }));
      next[fromGroup].players = next[fromGroup].players.filter((id: number) => id !== gid);
      next[toGroup].players = [...next[toGroup].players, gid];
      return next;
    });
    setPairingsDirty(true);
    setMoving(null);
  };

  const [pairingsDirty, setPairingsDirty] = useState(false);

  const confirmPairings = () => {
    if (!pairings || !selEvent) return;
    const teeMap: Record<number, string> = {};
    pairings.forEach(g => g.players.forEach((gid: number) => { teeMap[gid] = g.teeTime; }));
    setSignups((p: any) => p.map((s: any) => {
      if (s.event_id !== selEvent.event_id || !teeMap[s.golfer_id]) return s;
      return { ...s, assigned_tee_time: teeMap[s.golfer_id] };
    }));
    setEvents((p: any) => p.map((e: any) => e.event_id === selEvent.event_id ? { ...e, status: "Pairings Set" } : e));
    setConfirmed(true); setPairingsDirty(false); setMoving(null);
    showSuccess("Pairings confirmed");
    scrollToTop?.();
  };

  const clearPairings = () => {
    if (!selEvent) return;
    if (!window.confirm("Clear all pairings for this event? This will reset it to Upcoming.")) return;
    setSignups((p: any) => p.map((s: any) => s.event_id === selEvent.event_id ? { ...s, assigned_tee_time: null } : s));
    setEvents((p: any) => p.map((e: any) => e.event_id === selEvent.event_id ? { ...e, status: "Upcoming" } : e));
    // Persist to DB
    eventSignups.forEach((s: any) => {
      if (s.signup_id < 1e12)
        supabase.from("event_signups").update({ assigned_tee_time: null }, { signup_id: s.signup_id }).catch(() => {});
    });
    setPairings(null); setConfirmed(false); setMoving(null);
    showSuccess("Pairings cleared -- event reset to Upcoming");
  };

  const buildBody = () => {
    if (!pairings || !selEvent) return "";
    let b = `Pairings set for ${formatDate(selEvent.date)} @ ${selEvent.course_name}\n\n`;
    pairings.forEach((g: any, i: number) => {
      b += `Group ${i + 1} - Tee: ${g.teeTime}\n`;
      g.players.forEach((gid: number) => {
        const gl = golfers.find((x: any) => x.golfer_id === gid);
        b += `  * ${gl?.first_name} ${gl?.last_name}${gl?.is_guest ? " (Guest)" : ""}\n`;
      }); b += "\n";
    });
    return b;
  };

  const allEmails = golfers.filter((g: any) => !g.is_guest && g.email_address).map((g: any) => g.email_address);

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 12 }}>Pairing Engine</div>
      <div className="form-group"><label className="form-label">Event</label>
        <select className="form-select" value={selEventId} onChange={e => { setSelEventId(e.target.value); setPairings(null); setConfirmed(false); setMoving(null); }}>
          <option value="">Select event…</option>
          {events.filter((e: any) => e.status !== "Completed").map((ev: any) => <option key={ev.event_id} value={ev.event_id}>{formatDate(ev.date)} -- {ev.course_name}</option>)}
        </select>
      </div>
      {selEvent && <div className="card" style={{ padding: "10px 14px", marginBottom: 12 }}>
        <div className="info-row"><span className="info-key">In groups</span><span className="info-val" style={{ color: "var(--green-700)", fontWeight: 700 }}>{confirmedInGroups.length}</span></div>
        {waitingRoomAdmin.length > 0 && <div className="info-row"><span className="info-key">Waiting room</span><span className="info-val" style={{ color: "var(--gold-700)", fontWeight: 700 }}>{waitingRoomAdmin.length} player{waitingRoomAdmin.length !== 1 ? "s" : ""}</span></div>}
        <div className="info-row"><span className="info-key">Tee times</span><span className="info-val">{selEvent.tee_times.join(" · ")}</span></div>
        <div className="info-row"><span className="info-key">Max capacity</span><span className="info-val">{selEvent.tee_times.length * 4} players ({selEvent.tee_times.length} groups × 4)</span></div>
        <div className="info-row"><span className="info-key">Status</span><span className="pill pill-gold">{selEvent.status}</span></div>
      </div>}
      <button className="btn btn-gold btn-full" onClick={runPairings} disabled={!selEvent || eventSignups.length < 2}>🎲 {confirmed ? "Re-generate Pairings" : "Generate Pairings"}</button>

      {pairings && (
        <div ref={pairingsRef} style={{ marginTop: 14 }}>
          {/* 3e) Adjustment hint */}
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
            {moving
              ? <span style={{ color: "var(--gold-700)", fontWeight: 600 }}>Tap a group to move {golferName(golfers, moving.gid).split(" ")[0]} there · <button style={{ background: "none", border: "none", color: "var(--red-600)", cursor: "pointer", fontSize: 13, fontWeight: 600 }} onClick={() => setMoving(null)}>Cancel</button></span>
              : "Tap a player name to move them to another group"}
          </div>

          {pairings.map((group: any, i: number) => (
            <div key={i} className="pairing-card" style={moving && moving.fromGroup !== i ? { borderColor: "var(--green-400)", cursor: "pointer" } : {}}>
              <div
                className="pairing-header"
                onClick={() => { if (moving && moving.fromGroup !== i) movePlayer(moving.gid, moving.fromGroup, i); }}
                style={{ cursor: moving && moving.fromGroup !== i ? "pointer" : "default" }}
              >
                <span className="pairing-time">⏱ {group.teeTime}</span>
                <span className="pairing-group">Group {i + 1} · {group.players.length} players{moving && moving.fromGroup !== i ? " -- tap to move here" : ""}</span>
              </div>
              <div className="pairing-body">
                {group.players.map((gid: number) => {
                  const g = golfers.find((x: any) => x.golfer_id === gid);
                  const isMoving = moving?.gid === gid;
                  return (
                    <div key={gid} className="pairing-player"
                      style={{ background: isMoving ? "var(--gold-50)" : undefined, cursor: "pointer" }}
                      onClick={() => { if (!moving) setMoving({ gid, fromGroup: i }); }}
                    >
                      <div>
                        <span style={{ fontWeight: 500, color: isMoving ? "var(--gold-700)" : undefined }}>{g?.first_name} {g?.last_name}{isMoving ? " ✋" : ""}</span>
                        {g?.is_guest && <span style={{ fontSize: 11, fontWeight: 600, background: "var(--gold-100)", borderRadius: 4, padding: "1px 5px", marginLeft: 5, color: "var(--gold-800)" }}>guest</span>}
                      </div>
                      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>HCP {g?.current_handicap_index?.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Waiting room — admin can move into open spots */}
          {waitingRoomAdmin.length > 0 && (
            <div style={{ marginTop: 14, border: "2px dashed var(--gold-300)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--gold-50)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gold-700)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                🕐 Waiting Room <span style={{ fontSize: 11, fontWeight: 500, color: "var(--gold-600)" }}>({waitingRoomAdmin.length} player{waitingRoomAdmin.length !== 1 ? "s" : ""} pending a spot)</span>
              </div>
              {waitingRoomAdmin.map((su: any) => {
                const g = golfers.find((x: any) => x.golfer_id === su.golfer_id);
                const openGroups = (pairings || []).map((grp: any, i: number) => ({ ...grp, i })).filter((grp: any) => grp.players.length < 4);
                return (
                  <div key={su.signup_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--gold-100)" }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>
                      {g ? `${g.first_name} ${g.last_name}` : "Guest"}
                      {su.is_guest_entry && <span style={{ fontSize: 11, fontWeight: 600, background: "var(--gold-100)", borderRadius: 4, padding: "1px 5px", marginLeft: 6, color: "var(--gold-800)" }}>guest</span>}
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>HCP {g?.current_handicap_index?.toFixed(1)}</span>
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {openGroups.length > 0 ? openGroups.map((grp: any) => (
                        <button key={grp.teeTime}
                          style={{ fontSize: 11, padding: "3px 8px", background: "var(--green-50)", border: "1px solid var(--green-300)", borderRadius: 6, cursor: "pointer", color: "var(--green-700)", fontWeight: 600 }}
                          onClick={() => {
                            // Move from waiting room into this group
                            setPairings((prev: any) => prev.map((g: any, idx: number) => idx === grp.i ? { ...g, players: [...g.players, su.golfer_id] } : g));
                            setSignups((p: any) => p.map((s: any) => s.signup_id === su.signup_id ? { ...s, in_waiting_room: false, assigned_tee_time: grp.teeTime } : s));
                            if (su.signup_id < 1e12) supabase.from("event_signups").update({ in_waiting_room: false, assigned_tee_time: grp.teeTime }, { signup_id: su.signup_id }).catch(() => {});
                          }}
                        >→ {grp.teeTime} (group {grp.i + 1})</button>
                      )) : (
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>All groups full</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary"
              style={{ flex: 1, opacity: (confirmed && !pairingsDirty) ? 0.45 : 1, cursor: (confirmed && !pairingsDirty) ? "default" : "pointer" }}
              disabled={confirmed && !pairingsDirty}
              onClick={confirmPairings}
            >{confirmed && !pairingsDirty ? "✓ Pairings Saved" : confirmed ? "↻ Update Pairings" : "Confirm Pairings"}</button>
            <a href={`mailto:?cc=${allEmails.join(",")}&subject=Pairings - ${selEvent.course_name} ${selEvent.tee_times.join(", ")}&body=${encodeURIComponent(buildBody())}%0D%0A View pairings in the app: https://saturdayschool.vercel.app/?tab=rsvp%26subtab=pairings`} className="btn btn-outline" style={{ flex: 1, textDecoration: "none" }}>✉ Email</a>
          </div>
          {selEvent?.status === "Pairings Set" && (
            <button
              className="btn btn-outline btn-full"
              style={{ marginTop: 8, color: "var(--red-600)", borderColor: "var(--red-300)", fontSize: 14 }}
              onClick={clearPairings}
            >🗑 Clear Pairings</button>
          )}
        </div>
      )}
    </div>
  );
}
