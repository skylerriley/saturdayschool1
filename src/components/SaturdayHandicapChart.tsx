// SaturdayHandicapChart.tsx
// -----------------------------------------------------------------------------
// Per-golfer "Saturday Handicap" card: a WHS Handicap Index computed from
// competitive 18-hole gross scores, shown as one bar per qualifying round
// (gross = bar height, on-bar gross label). Gold bars currently count toward
// the index; green bars are the rest. Tap a bar to reveal a review panel below
// the chart -- same interaction and formatting as the Hole Streaks chart. The
// large index metric sits top-right; the title top-left.
//
// The WHS math is frozen in lib/saturdayHandicap.ts. This component only
// displays the adapter output (lib/saturdayHandicapData.ts).
//
// Rendered as plain HTML div-bars (no Chart.js) so there are no axes, grid
// lines, or canvas token issues -- matching the app's Hole Streaks bar chart.
//
// Comments are ASCII-only to stay safe under the oxc parser.
// -----------------------------------------------------------------------------

import { useMemo, useState, useEffect } from "react";
import { computeGolferSaturdayHandicap } from "../lib/saturdayHandicapData";

// -- Design tokens resolved to hex (see App.tsx CSS block) --------------------
const GOLD = "#e09400";        // --gold-500  : counts toward handicap
const GREEN = "#5cc98a";       // --green-300 : other rounds (readable on dark)
const CARD_BG = "#0a2e1a";     // --green-900 : card background (matches fingerprint)
const TEXT_ON_DARK = "#ffffff";
const TEXT_MUTED_DARK = "rgba(255,255,255,0.5)";

const BAR_H = 120; // matches the Hole Streaks chart

// Match the Hole Streaks date formatting exactly.
const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Format the index for display. A negative index is a PLUS handicap: show +2.1.
function formatIndex(idx: number): string {
  if (idx < 0) return "+" + Math.abs(idx).toFixed(1);
  return idx.toFixed(1);
}

export function SaturdayHandicapChart({
  golfer,
  leaderboard,
  holeScores,
  courses,
  signups,
  events,
}: {
  golfer: any;
  leaderboard: any[];
  holeScores: any[];
  courses: any[];
  signups: any[];
  events: any[];
}) {
  const [selectedBar, setSelectedBar] = useState<number | null>(null);

  // Compute once per golfer / data change. Top-level hook (never inside JSX).
  const { state, trace } = useMemo(
    () =>
      computeGolferSaturdayHandicap(
        golfer?.golfer_id,
        leaderboard,
        holeScores,
        courses,
        signups,
        events
      ),
    [golfer?.golfer_id, leaderboard, holeScores, courses, signups, events]
  );

  // Reset selection when the golfer changes.
  useEffect(() => { setSelectedBar(null); }, [golfer?.golfer_id]);

  const nRounds = trace.length;
  const idx = state.handicapIndex;

  // -- Header metric + sub-label ----------------------------------------------
  let metric: string;
  let subLabel: string;
  if (idx == null || nRounds < 3) {
    metric = "—"; // em dash
    subLabel = `${nRounds} of 3 to establish`;
  } else {
    metric = formatIndex(idx);
    subLabel = "index";
  }

  // Baseline near the lowest gross (not zero) so scores spread visually.
  const grosses = trace.map((t) => t.gross);
  const minGross = grosses.length ? Math.min(...grosses) : 0;
  const maxGross = grosses.length ? Math.max(...grosses) : 0;
  const floor = Math.max(0, minGross - 3);
  const span = Math.max(1, maxGross - floor);

  const sel = selectedBar != null ? trace[selectedBar] : null;

  return (
    <div
      style={{
        background: CARD_BG,
        borderRadius: "var(--radius-md)",
        padding: 16,
        marginBottom: 16,
      }}
    >
      {/* Header: title top-left, big index metric top-right */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", color: TEXT_MUTED_DARK, fontWeight: 700 }}>
          Saturday Handicap
        </div>
        <div style={{ textAlign: "right", lineHeight: 1 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: TEXT_ON_DARK, fontVariantNumeric: "tabular-nums" }}>
            {metric}
          </div>
          <div style={{ fontSize: 11, color: TEXT_MUTED_DARK, marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {subLabel}
          </div>
        </div>
      </div>

      {nRounds === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: TEXT_MUTED_DARK, fontSize: 14 }}>
          No competitive rounds yet
        </div>
      ) : (
        <>
          {/* Bars */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: BAR_H }}>
            {trace.map((t, i) => {
              const heightPx = Math.max(6, Math.round(((t.gross - floor) / span) * BAR_H));
              const isSelected = selectedBar === i;
              const color = t.contributes ? GOLD : GREEN;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedBar(isSelected ? null : i)}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: BAR_H, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)", marginBottom: 3, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                    {t.gross}
                  </div>
                  <div style={{
                    width: "80%", height: heightPx,
                    background: color,
                    borderRadius: "3px 3px 0 0",
                    opacity: isSelected ? 1 : 0.78,
                    outline: isSelected ? `2px solid ${color}` : "none",
                    outlineOffset: 1,
                    transition: "opacity 0.15s,outline 0.15s",
                  }} />
                </div>
              );
            })}
          </div>

          {/* Legend below the bars */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: TEXT_MUTED_DARK }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: GOLD }} />
              Counts toward handicap
            </div>
          </div>

          {/* Selected-bar review panel (same style as Hole Streaks) */}
          {sel && (
            <div style={{ marginTop: 12, background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: "11px 14px", borderLeft: `3px solid ${sel.contributes ? GOLD : GREEN}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: sel.contributes ? GOLD : GREEN, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{sel.gross}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{sel.courseName}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {fmtDate(sel.date)}{sel.teeName ? ` · ${sel.teeName} tees` : ""}
                  </div>
                </div>
                {sel.contributes && (
                  <div style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD }}>Counts</div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <PanelCell label="Rating / Slope" value={`${sel.courseRating.toFixed(1)} / ${sel.slopeRating}`} />
                <PanelCell label="Differential" value={sel.differential.toFixed(1)} />
                <PanelCell label="Gross" value={String(sel.gross)} />
                <PanelCell label="Adjusted Gross" value={String(sel.adjustedGross)} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PanelCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
