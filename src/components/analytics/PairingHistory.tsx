import { useState, useRef, useEffect } from "react";

interface TrailDot {
  eventId: number;
  date: string;
  course: string;
  status: "paired" | "diff" | "absent";
}

interface PairingRecord {
  partnerId: number;
  partnerName: string;
  timesPaired: number;
  lastPairedDate: string;
  avgPtsDelta: number | null;
  trail: TrailDot[];
}

interface NeverPlayedRecord {
  partnerId: number;
  partnerName: string;
  sharedRounds: number;
}

function fmtShort(dateStr: string) {
  const dt = new Date(dateStr + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function courseShort(name: string) {
  return name.replace(" Golf Club", "").replace("Golf Course", "").replace(" GC", "").split(" ").slice(0, 2).join(" ");
}

interface TooltipState {
  text: string;
  x: number;
  y: number;
}

function TrailRow({ trail, events }: { trail: TrailDot[]; events: any[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = (dot: TrailDot, el: HTMLElement) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const rect = el.getBoundingClientRect();
    const label = dot.status === "paired" ? "Paired together" : dot.status === "diff" ? "Different group" : "One player absent";
    setTooltip({ text: `${dot.date} · ${dot.course} · ${label}`, x: rect.left + rect.width / 2, y: rect.top - 8 });
    timerRef.current = setTimeout(() => setTooltip(null), 2000);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div style={{ padding: "10px 12px", background: "var(--surface2)", borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textAlign: "center" }}>Tap a dot to see event details</div>
      <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4, justifyContent: "center" }}>
        {trail.map((dot) => {
          const isPaired = dot.status === "paired";
          const isAbsent = dot.status === "absent";
          return (
            <button
              key={dot.eventId}
              onClick={(e) => showTooltip(dot, e.currentTarget)}
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                flexShrink: 0,
                cursor: "pointer",
                border: isPaired ? "none" : isAbsent ? "1.5px solid #9c7c65" : "none",
                background: isPaired ? "var(--green-600)" : isAbsent ? "transparent" : "#9c7c65",
                padding: 0,
                WebkitTapHighlightColor: "transparent",
              }}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 8, justifyContent: "center" }}>
        {[
          { color: "var(--green-600)", border: "none", label: "Paired" },
          { color: "transparent", border: "1.5px solid #9c7c65", label: "Absent" },
          { color: "#9c7c65", border: "none", label: "Diff group" },
        ].map((item) => (
          <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: item.color, border: item.border, display: "inline-block", flexShrink: 0 }} />
            {item.label}
          </span>
        ))}
      </div>
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: Math.min(Math.max(tooltip.x, 80), window.innerWidth - 80),
            top: tooltip.y - 42,
            transform: "translateX(-50%)",
            background: "var(--green-900)",
            color: "var(--gold-300)",
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 10px",
            borderRadius: "var(--radius-sm)",
            whiteSpace: "nowrap",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          {tooltip.text}
          {/* Downward tail pointing at the tapped dot */}
          <span style={{
            position: "absolute",
            bottom: -12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "12px solid var(--green-900)",
          }} />
        </div>
      )}
    </div>
  );
}

interface PairingHistoryProps {
  golfer: any;
  signups: any[];
  seasonEvents: any[];
  leaderboard: any[];
  golfers: any[];
}

export function PairingHistory({ golfer, signups, seasonEvents, leaderboard, golfers }: PairingHistoryProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const playerId = golfer.golfer_id;

  // Only active non-guest players other than the subject
  const otherPlayers = golfers.filter((g: any) => !g.is_guest && g.status === "Active" && g.golfer_id !== playerId);

  // Events sorted oldest first where at least the subject was in the field
  const relevantEvents = [...seasonEvents]
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Build signups lookup: eventId -> { golfer_id -> assigned_tee_time | null }
  // Two golfers with the same non-null assigned_tee_time in the same event were paired together.
  const eventFieldMap: Record<number, Record<number, string | null>> = {};
  signups.forEach((s: any) => {
    if (s.attending !== "Yes") return;
    if (!relevantEvents.some((e: any) => e.event_id === s.event_id)) return;
    if (!eventFieldMap[s.event_id]) eventFieldMap[s.event_id] = {};
    eventFieldMap[s.event_id][s.golfer_id] = s.assigned_tee_time ?? null;
  });

  // Subject's overall avg pts for delta calculation
  const subjectAllPts = leaderboard
    .filter((r: any) => r.golfer_id === playerId && relevantEvents.some((e: any) => e.event_id === r.event_id))
    .map((r: any) => r.total_stableford_points);
  const overallAvg = subjectAllPts.length ? subjectAllPts.reduce((a: number, b: number) => a + b, 0) / subjectAllPts.length : null;

  // Build PairingRecord for each other player
  const pairingRecords: PairingRecord[] = otherPlayers.map((partner: any) => {
    const trail: TrailDot[] = [];
    let timesPaired = 0;
    let lastPairedDate = "";
    const pairedEventPts: number[] = [];

    relevantEvents.forEach((ev: any) => {
      const field = eventFieldMap[ev.event_id] || {};
      const subjectPresent = playerId in field;
      const partnerPresent = partner.golfer_id in field;

      if (!subjectPresent && !partnerPresent) return;

      const shortDate = fmtShort(ev.date);
      const cShort = courseShort(ev.course_name || "");

      if (subjectPresent && partnerPresent) {
        const sTee = field[playerId];
        const pTee = field[partner.golfer_id];
        if (sTee != null && pTee != null && sTee === pTee) {
          trail.push({ eventId: ev.event_id, date: shortDate, course: cShort, status: "paired" });
          timesPaired++;
          lastPairedDate = shortDate;
          const lbEntry = leaderboard.find((r: any) => r.event_id === ev.event_id && r.golfer_id === playerId);
          if (lbEntry) pairedEventPts.push(lbEntry.total_stableford_points);
        } else {
          trail.push({ eventId: ev.event_id, date: shortDate, course: cShort, status: "diff" });
        }
      } else {
        trail.push({ eventId: ev.event_id, date: shortDate, course: cShort, status: "absent" });
      }
    });

    let avgPtsDelta: number | null = null;
    if (timesPaired >= 3 && pairedEventPts.length >= 3 && overallAvg != null) {
      const pairedAvg = pairedEventPts.reduce((a, b) => a + b, 0) / pairedEventPts.length;
      avgPtsDelta = pairedAvg - overallAvg;
    }

    return {
      partnerId: partner.golfer_id,
      partnerName: `${partner.first_name} ${partner.last_name}`,
      timesPaired,
      lastPairedDate,
      avgPtsDelta,
      trail,
    };
  });

  // Sort: desc by timesPaired, then by lastPairedDate
  const sortedPairings = [...pairingRecords]
    .filter((r) => r.trail.length > 0)
    .sort((a, b) => {
      if (b.timesPaired !== a.timesPaired) return b.timesPaired - a.timesPaired;
      return a.lastPairedDate < b.lastPairedDate ? 1 : -1;
    });

  // Never played with: timesPaired===0 AND has at least one diff dot
  const neverPlayedWith: NeverPlayedRecord[] = pairingRecords
    .filter((r) => r.timesPaired === 0 && r.trail.some((d) => d.status === "diff"))
    .map((r) => ({ partnerId: r.partnerId, partnerName: r.partnerName, sharedRounds: r.trail.filter((d) => d.status === "diff").length }))
    .sort((a, b) => b.sharedRounds - a.sharedRounds);

  const uniquePartners = pairingRecords.filter((r) => r.timesPaired >= 1).length;
  const mostFrequentTimes = sortedPairings.length ? sortedPairings[0].timesPaired : 0;

  const pillStyle = (times: number): React.CSSProperties => {
    if (times >= 3) return { background: "rgba(26,115,64,0.12)", color: "var(--green-700)", border: "1px solid rgba(26,115,64,0.25)" };
    if (times === 2) return { background: "rgba(196,120,0,0.12)", color: "var(--gold-600)", border: "1px solid rgba(196,120,0,0.25)" };
    return { background: "rgba(74,55,40,0.08)", color: "var(--text-muted)", border: "1px solid var(--border)" };
  };

  const deltaColor = (delta: number | null): string => {
    if (delta == null) return "var(--text-muted)";
    return delta >= 0 ? "var(--green-700)" : "var(--red-600)";
  };

  // Most frequent partner name
  const mostFrequentPartner = sortedPairings.length ? sortedPairings[0] : null;

  // Collect all first names across all partners to detect duplicates
  const allFirstNames = pairingRecords.map((r) => r.partnerName.split(" ")[0]);
  const firstNameCounts: Record<string, number> = {};
  allFirstNames.forEach((fn) => { firstNameCounts[fn] = (firstNameCounts[fn] ?? 0) + 1; });

  function displayName(fullName: string): string {
    const parts = fullName.split(" ");
    const first = parts[0];
    if (firstNameCounts[first] > 1 && parts.length > 1) {
      return `${first} ${parts[parts.length - 1][0]}.`;
    }
    return first;
  }

  return (
    <div style={{ marginTop: 24, marginBottom: 20 }}>
      {/* Summary card — dark green with three sub-cards */}
      <div style={{ background: "var(--green-900)", borderRadius: "var(--radius-md)", padding: "16px 12px", marginBottom: 14 }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
            Pairing History
          </div>
          <button
            onClick={() => setInfoOpen(!infoOpen)}
            style={{
              width: 16, height: 16, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.3)",
              background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, lineHeight: 1, WebkitTapHighlightColor: "transparent",
            }}
          >
            i
          </button>
        </div>

        {/* Info panel */}
        {infoOpen && (
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "var(--radius-sm,6px)", padding: "10px 12px", marginBottom: 12, fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.55)" }}>
            <div style={{ marginBottom: 8 }}>Shows every round this season where both players were present in the field.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--green-400)", display: "inline-block" }} />
                <span>Paired together</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", border: "1.5px solid #9c7c65", background: "transparent", display: "inline-block" }} />
                <span>One player absent</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#9c7c65", display: "inline-block" }} />
                <span>Different group</span>
              </span>
            </div>
          </div>
        )}

        {/* Three sub-cards: Never Played With | Partners | Most Frequent */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {/* Never Played With */}
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "var(--radius-sm,6px)", padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Never Played</div>
            <div style={{ fontSize: 35, fontWeight: 700, lineHeight: 1, color: neverPlayedWith.length > 0 ? "#e07070" : "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>
              {neverPlayedWith.length}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 5 }}>active players</div>
          </div>

          {/* Partners */}
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "var(--radius-sm,6px)", padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Partners</div>
            <div style={{ fontSize: 45, fontWeight: 700, lineHeight: 1, color: "#7dc07d", fontVariantNumeric: "tabular-nums" }}>
              {uniquePartners}
            </div>
           
          </div>

          {/* Most Frequent */}
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "var(--radius-sm,6px)", padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Most Frequent</div>
            <div style={{ fontSize: mostFrequentPartner ? 28 : 35, fontWeight: 700, lineHeight: 1.1, color: "#e8a020", fontVariantNumeric: "tabular-nums" }}>
              {mostFrequentPartner ? displayName(mostFrequentPartner.partnerName) : "--"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginTop: 5 }}>
              {mostFrequentTimes > 0 ? `${mostFrequentTimes}x paired` : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Pairing table */}
      {sortedPairings.filter((r) => r.timesPaired >= 1).length > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 16 }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 54px", padding: "8px 12px", background: "var(--green-900)" }}>
            {["Player", "Times", "Pts Δ"].map((h, i) => (
              <div key={i} style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: i > 0 ? "center" : "left", paddingLeft: i === 0 ? 4 : 0 }}>{h}</div>
            ))}
          </div>
          {sortedPairings.filter((r) => r.timesPaired >= 1).map((r, i) => {
            const isOpen = expandedRow === r.partnerId;
            return (
              <div key={r.partnerId}>
                <div
                  onClick={() => setExpandedRow(isOpen ? null : r.partnerId)}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 44px 54px",
                    padding: "10px 12px",
                    background: i % 2 === 1 ? "var(--surface2)" : "var(--surface)",
                    borderTop: "1px solid var(--border)",
                    cursor: "pointer", alignItems: "center",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <div style={{ paddingLeft: 4, textAlign: "left", alignSelf: "start" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{r.partnerName}</div>
                    {r.lastPairedDate && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>Last paired: {r.lastPairedDate}</div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, padding: "2px 7px", borderRadius: "var(--radius-sm)",
                      ...pillStyle(r.timesPaired),
                    }}>
                      {r.timesPaired}
                    </span>
                  </div>
                  <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14, color: deltaColor(r.avgPtsDelta) }}>
                    {r.avgPtsDelta != null ? `${r.avgPtsDelta >= 0 ? "+" : ""}${r.avgPtsDelta.toFixed(1)}` : "—"}
                  </div>
                </div>
                {isOpen && <TrailRow trail={r.trail} events={seasonEvents} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Never played with subsection */}
      {neverPlayedWith.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
            Active players only. &ldquo;Shared rounds&rdquo; = rounds where both were present in the field on the same day.
          </div>
          <div style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 54px", padding: "8px 12px", background: "var(--green-900)" }}>
              {["Player", "", "Shared"].map((h, i) => (
                <div key={i} style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-300)", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: i > 0 ? "center" : "left", paddingLeft: i === 0 ? 4 : 0 }}>{h}</div>
              ))}
            </div>
            {neverPlayedWith.map((r, i) => (
              <div
                key={r.partnerId}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 44px 54px",
                  padding: "10px 12px",
                  background: i % 2 === 1 ? "var(--surface2)" : "var(--surface)",
                  borderTop: "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", paddingLeft: 4, textAlign: "left", alignSelf: "start" }}>{r.partnerName}</div>
                <div />
                <div style={{ textAlign: "center" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, padding: "2px 7px", borderRadius: "var(--radius-sm)",
                    background: "rgba(196,120,0,0.12)", color: "var(--gold-600)", border: "1px solid rgba(196,120,0,0.25)",
                  }}>
                    {r.sharedRounds}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sortedPairings.length === 0 && neverPlayedWith.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14, padding: "20px 0" }}>
          No pairing data available for this season.
        </div>
      )}
    </div>
  );
}
