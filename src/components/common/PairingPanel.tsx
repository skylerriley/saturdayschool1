import { useState, useEffect } from "react";
import { runPairingEngine, buildPairingFrequencyMap } from "../../lib/golfMath";
import { golferName, formatDate } from "../../lib/formatters";
import { supabase, sendPush, reportWriteError } from "../../lib/supabaseClient";
import { BEZEL_BTN_LIGHT, BEZEL_BTN_STRONG, BADGE_DEPRESSED_BEZEL } from "../../tabs/leaderboard/bezelStyles";

interface PairingPanelProps {
  golfers: any[];
  events: any[];
  setEvents: (fn: any) => void;
  signups: any[];
  setSignups: (fn: any) => void;
  selEventId: number;
  adminMode: boolean;
  showSuccess: (msg: string) => void;
  showError?: (msg: string) => void;
  scrollToTop?: () => void;
}

export function PairingPanel({
  golfers,
  events,
  setEvents,
  signups,
  setSignups,
  selEventId,
  adminMode,
  showSuccess,
  showError,
  scrollToTop,
}: PairingPanelProps) {
  const [pairingsConfirmed, setPairingsConfirmed] = useState(false);
  const [pairingsChanged, setPairingsChanged] = useState(false);
  const [moving, setMoving] = useState<{ signup_id: number; gid: number; fromTee: string } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null); // signup_id being confirmed for removal

  useEffect(() => {
    setPairingsConfirmed(false);
    setPairingsChanged(false);
    setMoving(null);
    setRemoving(null);
  }, [selEventId]);

  const selEvent = events.find((e: any) => e.event_id === selEventId);
  const eventSignups = signups.filter((s: any) => s.event_id === selEventId);

  const pairingsByTee = selEvent?.tee_times
    ? selEvent.tee_times.map((tt: string) => ({
        teeTime: tt,
        players: eventSignups.filter(
          (s: any) => s.assigned_tee_time === tt && s.attending === "Yes" && !s.in_waiting_room
        ),
      }))
    : [];

  const hasPairings = pairingsByTee.some((g: any) => g.players.length > 0);
  const waitingRoom = eventSignups.filter((s: any) => s.in_waiting_room && s.attending === "Yes");

  const generatePairings = () => {
    if (!selEvent) return;
    const attending = eventSignups.filter((s: any) => s.attending === "Yes" && !s.in_waiting_room);
    if (attending.length < 2) {
      alert("Need at least 2 confirmed players to generate pairings.");
      return;
    }
    const attendees = attending.map((s: any) => ({
      golfer_id: s.golfer_id,
      sponsor_golfer_id: s.sponsor_golfer_id,
      early_tee_request: !!s.early_tee_request,
    }));
    // Build pairing frequency from all past events (excluding this one) so the
    // engine can spread out repeat pairings across the season.
    const historicalSignups = signups.filter((s: any) => s.event_id !== selEventId);
    const freq = buildPairingFrequencyMap(historicalSignups);
    const newPairings = runPairingEngine(attendees, selEvent.tee_times || [], freq);
    const teeByGolfer: Record<number, string> = {};
    // A { teeTime: null } group means the field exceeds tee-time capacity
    // (4 per group) — those players go to the waiting room instead of
    // being crammed into a 5+ player group.
    const overflowIds = new Set<number>();
    newPairings.forEach((grp: any) => grp.players.forEach((pid: number) => {
      if (grp.teeTime == null) overflowIds.add(pid);
      else teeByGolfer[pid] = grp.teeTime;
    }));
    setSignups((su: any) =>
      su.map((s: any) => {
        if (s.event_id !== selEventId) return s;
        if (overflowIds.has(s.golfer_id)) return { ...s, assigned_tee_time: null, in_waiting_room: true };
        if (teeByGolfer[s.golfer_id] !== undefined) return { ...s, assigned_tee_time: teeByGolfer[s.golfer_id] };
        return s;
      })
    );
    if (overflowIds.size > 0) {
      const msg = `Not enough tee times for the full field — ${overflowIds.size} player${overflowIds.size > 1 ? "s" : ""} moved to the waiting room. Add a tee time and regenerate.`;
      showError ? showError(msg) : alert(msg);
    }
    setMoving(null);
    setPairingsConfirmed(false);
    setPairingsChanged(true);
  };

  const movePlayer = (signup_id: number, toTee: string) => {
    setSignups((p: any) => p.map((s: any) => s.signup_id === signup_id ? { ...s, assigned_tee_time: toTee } : s));
    setMoving(null);
    setPairingsChanged(true);
  };

  const swapGroups = (teeA: string, teeB: string) => {
    if (!selEvent) return;
    setSignups((p: any) =>
      p.map((s: any) => {
        if (s.event_id !== selEvent.event_id || s.attending !== "Yes" || s.in_waiting_room) return s;
        if (s.assigned_tee_time === teeA) return { ...s, assigned_tee_time: teeB };
        if (s.assigned_tee_time === teeB) return { ...s, assigned_tee_time: teeA };
        return s;
      })
    );
    setPairingsChanged(true);
  };

  const removeFromPairings = (signup_id: number) => {
    setSignups((p: any) =>
      p.map((s: any) =>
        s.signup_id === signup_id
          ? { ...s, assigned_tee_time: null, in_waiting_room: true }
          : s
      )
    );
    if (signup_id < 1e12)
      supabase.from("event_signups").update({ assigned_tee_time: null, in_waiting_room: true }, { signup_id }).catch(reportWriteError("Pairing update"));
    setMoving(null);
    setRemoving(null);
    setPairingsChanged(true);
  };

  const confirmPairings = () => {
    if (!selEvent) return;
    setEvents((p: any) =>
      p.map((e: any) => e.event_id === selEvent.event_id ? { ...e, status: "Pairings Set" } : e)
    );
    if (selEvent.event_id < 1e12)
      supabase.from("events").update({ status: "Pairings Set" }, { event_id: selEvent.event_id }).catch(reportWriteError("Event status save"));
    eventSignups.filter((s: any) => s.assigned_tee_time).forEach((s: any) => {
      if (s.signup_id < 1e12)
        supabase.from("event_signups").update({ assigned_tee_time: s.assigned_tee_time }, { signup_id: s.signup_id }).catch(reportWriteError("Pairing save"));
    });
    setPairingsConfirmed(true);
    setPairingsChanged(false);
    showSuccess("Pairings confirmed");
    scrollToTop?.();
  };

  const clearPairings = () => {
    if (!selEvent) return;
    if (!window.confirm("Clear all pairings for this event? Tee time assignments will be removed and the event reset to Upcoming.")) return;
    setSignups((p: any) =>
      p.map((s: any) => s.event_id === selEvent.event_id ? { ...s, assigned_tee_time: null } : s)
    );
    setEvents((p: any) =>
      p.map((e: any) => e.event_id === selEvent.event_id ? { ...e, status: "Upcoming" } : e)
    );
    eventSignups.forEach((s: any) => {
      if (s.signup_id < 1e12)
        supabase.from("event_signups").update({ assigned_tee_time: null }, { signup_id: s.signup_id }).catch(reportWriteError("Pairing clear"));
    });
    if (selEvent.event_id < 1e12)
      supabase.from("events").update({ status: "Upcoming" }, { event_id: selEvent.event_id }).catch(reportWriteError("Event status save"));
    setPairingsConfirmed(false);
    setPairingsChanged(false);
    setMoving(null);
    showSuccess("Pairings cleared — event reset to Upcoming");
  };

  const allPairingEmails = golfers
    .filter((g: any) => !g.is_guest && g.email_address)
    .map((g: any) => g.email_address);

  const buildPairingBody = () => {
    if (!selEvent) return "";
    const nl = "\n";
    let b = "Pairings for " + formatDate(selEvent.date) + " @ " + selEvent.course_name + nl + nl;
    pairingsByTee.filter((g: any) => g.players.length > 0).forEach((grp: any, i: number) => {
      b += "Group " + (i + 1) + " - Tee: " + grp.teeTime + nl;
      grp.players.forEach((su: any) => {
        const gl = golfers.find((x: any) => x.golfer_id === su.golfer_id);
        b += "  * " + (gl ? gl.first_name + " " + gl.last_name : "Guest") + (gl?.is_guest ? " (Guest)" : "") + nl;
      });
      b += nl;
    });
    return b;
  };

  if (!selEvent) return null;

  const activeGroups = pairingsByTee.filter((g: any) => g.players.length > 0);

  return (
    <div>
      {adminMode && (
        <button
          className="btn btn-gold btn-full"
          style={{ marginBottom: 14, fontWeight: 700, boxShadow: BEZEL_BTN_STRONG }}
          onClick={generatePairings}
        >
          🎲 {hasPairings ? "Re-generate Pairings" : "Generate Pairings"}
        </button>
      )}

      {adminMode && hasPairings && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
          {moving ? (
            <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: "var(--gold-700)", fontWeight: 600 }}>
                Moving {golferName(golfers, moving.gid).split(" ")[0]} — tap a group to place them
              </span>
              <button
                style={{ background: "none", border: "1px solid var(--red-300)", borderRadius: 5, color: "var(--red-600)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "2px 8px" }}
                onClick={() => {
                  if (removing === moving.signup_id) {
                    removeFromPairings(moving.signup_id);
                  } else {
                    setRemoving(moving.signup_id);
                  }
                }}
              >
                {removing === moving.signup_id ? "Confirm remove?" : "✕ Remove from pairings"}
              </button>
              <button
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                onClick={() => { setMoving(null); setRemoving(null); }}
              >
                Cancel
              </button>
            </span>
          ) : (
            "Tap a player to move or remove them"
          )}
        </div>
      )}

      {!hasPairings ? (
        <div className="empty-state">
          <div className="empty-text">Pairings not yet set</div>
          <div className="empty-sub">
            {adminMode ? "Tap Generate Pairings above" : "Check back after the admin sets pairings"}
          </div>
        </div>
      ) : (
        activeGroups.map((group: any, gi: number) => {
          const isDropTarget = adminMode && moving && moving.fromTee !== group.teeTime;
          return (
            <div
              key={gi}
              className="pairing-card"
              style={isDropTarget ? { borderColor: "var(--green-400)", cursor: "pointer" } : {}}
              onClick={() => { if (isDropTarget && moving) movePlayer(moving.signup_id, group.teeTime); }}
            >
              <div
                className="pairing-header"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div>
                  <span className="pairing-time">⏱ {group.teeTime} </span>
                  <span className="pairing-group">
                    Group {gi + 1} · {group.players.length} players
                    {isDropTarget ? " — tap to move here" : ""}
                  </span>
                </div>
                {adminMode && activeGroups.length > 1 && !moving && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {gi > 0 && (
                      <button
                        onClick={(e: any) => { e.stopPropagation(); swapGroups(group.teeTime, activeGroups[gi - 1].teeTime); }}
                        style={{ background: "var(--green-700)", color: "white", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
                      >▲</button>
                    )}
                    {gi < activeGroups.length - 1 && (
                      <button
                        onClick={(e: any) => { e.stopPropagation(); swapGroups(group.teeTime, activeGroups[gi + 1].teeTime); }}
                        style={{ background: "var(--green-700)", color: "white", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
                      >▼</button>
                    )}
                  </div>
                )}
              </div>
              <div className="pairing-body">
                {group.players.map((su: any) => {
                  const g = golfers.find((x: any) => x.golfer_id === su.golfer_id);
                  const isMoving = moving?.signup_id === su.signup_id;
                  return (
                    <div
                      key={su.signup_id}
                      className="pairing-player"
                      style={{ background: isMoving ? "var(--gold-50)" : undefined, cursor: adminMode ? "pointer" : "default" }}
                      onClick={(e: any) => {
                        e.stopPropagation();
                        if (!adminMode) return;
                        if (moving && moving.signup_id === su.signup_id) { setMoving(null); setRemoving(null); return; }
                        if (!moving) { setMoving({ signup_id: su.signup_id, gid: su.golfer_id, fromTee: group.teeTime }); setRemoving(null); }
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 500, color: isMoving ? "var(--gold-700)" : undefined }}>
                          {g ? `${g.first_name} ${g.last_name}` : "Guest"}{isMoving ? " ✋" : ""}
                        </span>
                        {su.early_tee_request && (
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "var(--gold-600)", color: "white", fontSize: 8, fontWeight: 800, lineHeight: 1, marginLeft: 5, flexShrink: 0, boxShadow: BADGE_DEPRESSED_BEZEL, verticalAlign: "middle" }}>E</span>
                        )}
                        {su.is_guest_entry && (
                          <span style={{ fontSize: 11, fontWeight: 600, background: "var(--gold-100)", borderRadius: 4, padding: "1px 5px", marginLeft: 6, color: "var(--gold-800)" }}>guest</span>
                        )}
                      </div>
                      <span className="pairing-hcp" style={{ color: "var(--text-muted)", fontSize: 13 }}>
                        HCP {g?.current_handicap_index?.toFixed(1) ?? ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Waiting room */}
      {waitingRoom.length > 0 && (
        <div style={{ marginTop: 14, border: "2px dashed var(--gold-300)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--gold-50)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gold-700)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            🕐 Waiting Room{" "}
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--gold-600)" }}>
              ({waitingRoom.length} player{waitingRoom.length !== 1 ? "s" : ""} · waiting for a spot to open)
            </span>
          </div>
          {waitingRoom.map((su: any) => {
            const g = golfers.find((x: any) => x.golfer_id === su.golfer_id);
            const openGroups = pairingsByTee.filter((g: any) => g.players.length < 4);
            return (
              <div key={su.signup_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--gold-100)" }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>
                  {g ? `${g.first_name} ${g.last_name}` : "Guest"}
                  {su.is_guest_entry && (
                    <span style={{ fontSize: 11, fontWeight: 600, background: "var(--gold-100)", borderRadius: 4, padding: "1px 5px", marginLeft: 6, color: "var(--gold-800)" }}>guest</span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>HCP {g?.current_handicap_index?.toFixed(1)}</span>
                </span>
                {adminMode && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {openGroups.length > 0 ? openGroups.map((grp: any) => (
                      <button
                        key={grp.teeTime}
                        style={{ fontSize: 11, padding: "3px 8px", background: "var(--green-50)", border: "1px solid var(--green-300)", borderRadius: 6, cursor: "pointer", color: "var(--green-700)", fontWeight: 600 }}
                        onClick={() => {
                          setSignups((p: any) =>
                            p.map((s: any) =>
                              s.signup_id === su.signup_id
                                ? { ...s, assigned_tee_time: grp.teeTime, in_waiting_room: false }
                                : s
                            )
                          );
                          if (su.signup_id < 1e12)
                            supabase.from("event_signups").update({ assigned_tee_time: grp.teeTime, in_waiting_room: false }, { signup_id: su.signup_id }).catch(reportWriteError("Pairing save"));
                          setPairingsChanged(true);
                        }}
                      >
                        → {grp.teeTime}
                      </button>
                    )) : (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>All groups full</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!adminMode && (
            <div style={{ fontSize: 11, color: "var(--gold-600)", marginTop: 8, fontStyle: "italic" }}>
              If a player drops out, use their tee time slot to move a waiting room player in.
            </div>
          )}
        </div>
      )}

      {/* Admin action bar */}
      {adminMode && hasPairings && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <button
            className="btn btn-primary"
            style={{ opacity: (pairingsConfirmed && !pairingsChanged) ? 0.45 : 1, cursor: (pairingsConfirmed && !pairingsChanged) ? "default" : "pointer" }}
            disabled={pairingsConfirmed && !pairingsChanged}
            onClick={confirmPairings}
          >
            {pairingsConfirmed && !pairingsChanged ? "✓ Pairings Saved" : pairingsConfirmed ? "↻ Update Pairings" : "Confirm Pairings"}
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={
                "mailto:?cc=" + allPairingEmails.join(",") +
                "&subject=" + encodeURIComponent("Pairings - " + selEvent.course_name) +
                "&body=" + encodeURIComponent(buildPairingBody()) +
                "%0D%0A View pairings in the app: https://saturdayschool.vercel.app/?tab=rsvp%26subtab=pairings"
              }
              className="btn btn-outline"
              style={{ flex: 1, textDecoration: "none", boxShadow: BEZEL_BTN_LIGHT }}
            >
              ✉ Email Pairings
            </a>
            <button
              className="btn btn-outline"
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: BEZEL_BTN_LIGHT }}
              onClick={async () => {
                try {
                  await sendPush(
                    "Pairings are set",
                    `Check the pairings for the upcoming round @ ${selEvent?.course_name} on ${formatDate(selEvent?.date)}`,
                    "/?tab=rsvp&subtab=pairings"
                  );
                  showSuccess("Pairings notification sent!");
                  scrollToTop?.();
                } catch {
                  showError?.("Failed to send push notification");
                }
              }}
            >
              🔔 Notify
            </button>
          </div>

          <button
            className="btn btn-outline btn-full"
            style={{ color: "var(--red-600)", borderColor: "var(--red-300)", fontSize: 14, boxShadow: BEZEL_BTN_LIGHT }}
            onClick={clearPairings}
          >
            🗑 Clear All Pairings
          </button>
        </div>
      )}
    </div>
  );
}
