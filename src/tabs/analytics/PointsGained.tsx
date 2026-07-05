import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { ConsistencyTable } from "./ConsistencyTable";

// ── Constants ────────────────────────────────────────────────────────────────
const MIN_HOLES_PER_SPLIT = 6;
// Lower threshold for yardage sub-buckets: a course may only have 1-2 holes in range
const MIN_HOLES_PER_YARD_BUCKET = 1;
// Min golfers in a yardage bucket to show its sub-pill
const MIN_GOLFERS_FOR_BUCKET = 3;

const BAR_SCALE_MODE: "per_split" | "fixed" = "per_split";
const FIXED_SCALE_DELTA = 0.5;

// ── Yardage buckets per par ──────────────────────────────────────────────────
type YdBucket = { label: string; min: number; max: number };

const PAR3_BUCKETS: YdBucket[] = [
  { label: "100", min: 100, max: 149 },
  { label: "150", min: 150, max: 199 },
  { label: "200+", min: 200, max: Infinity },
];
const PAR4_BUCKETS: YdBucket[] = [
  { label: "250", min: 250, max: 299 },
  { label: "300", min: 300, max: 349 },
  { label: "350", min: 350, max: 399 },
  { label: "400", min: 400, max: 449 },
  { label: "450+", min: 450, max: Infinity },
];
const PAR5_BUCKETS: YdBucket[] = [
  { label: "400", min: 400, max: 449 },
  { label: "450", min: 450, max: 499 },
  { label: "500", min: 500, max: 549 },
  { label: "550+", min: 550, max: Infinity },
];

function bucketsForPar(par: number): YdBucket[] {
  if (par === 3) return PAR3_BUCKETS;
  if (par === 4) return PAR4_BUCKETS;
  if (par === 5) return PAR5_BUCKETS;
  return [];
}

// ── Ink underline nav ────────────────────────────────────────────────────────
function InkNav({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [inkStyle, setInkStyle] = useState<{ left: number; width: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const idx = tabs.findIndex(t => t.id === active);
    const el = btnRefs.current[idx];
    if (!el) return;
    const parent = scrollRef.current;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setInkStyle({ left: elRect.left - parentRect.left + parent.scrollLeft, width: elRect.width });
  }, [active, tabs]);

  return (
    // Outer wrapper holds the full-width track line, unaffected by scroll clip
    <div style={{ position: "relative", marginBottom: 16 }}>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "var(--border)" }} />
      {/* Scrollable pill row */}
      <div ref={scrollRef} style={{ position: "relative", display: "flex", gap: 16, overflowX: "auto", scrollbarWidth: "none" }}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={el => { btnRefs.current[i] = el; }}
            onClick={() => onChange(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "0 4px 12px",
              fontSize: 12, fontWeight: 700,
              color: active === t.id ? "var(--text-primary)" : "var(--text-muted)",
              WebkitTapHighlightColor: "transparent",
              transition: "color 0.2s",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {t.label}
          </button>
        ))}
        {/* Ink indicator — positioned inside scroll container so left offset is in scroll-space */}
        {inkStyle && (
          <div style={{
            position: "absolute", bottom: 0,
            left: inkStyle.left,
            width: inkStyle.width,
            height: 2,
            background: "var(--green-700)",
            borderRadius: 2,
            transition: "left 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1)",
          }} />
        )}
      </div>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function PGSkeleton() {
  return (
    <div style={{ animation: "pg-skeleton-fade 0.18s ease-out" }}>
      <style>{`
        @keyframes pg-skeleton-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pg-shimmer { 0%,100% { opacity: 0.45 } 50% { opacity: 0.9 } }
        .pg-skel { background: var(--border); border-radius: 4px; animation: pg-shimmer 1.2s ease-in-out infinite; }
      `}</style>
      {[1,2,3,4,5,6,7,8].map(i => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 0", borderBottom: "1px solid var(--border)" }}>
          <div className="pg-skel" style={{ width: 24, height: 14, flexShrink: 0, animationDelay: `${i*0.06}s` }} />
          <div className="pg-skel" style={{ width: 90 + (i % 3) * 20, height: 14, animationDelay: `${i*0.06+0.03}s` }} />
          <div style={{ flex: 1 }} />
          <div className="pg-skel" style={{ width: 36, height: 20, animationDelay: `${i*0.06+0.06}s` }} />
        </div>
      ))}
    </div>
  );
}

// ── Slide-in content wrapper ──────────────────────────────────────────────────
function PGSlide({ dir, children }: { dir: "left" | "right" | "none"; children: React.ReactNode }) {
  return (
    <div style={{
      animation: dir === "none" ? undefined : `pg-slide-${dir} 0.22s cubic-bezier(0.4,0,0.2,1) both`,
    }}>
      <style>{`
        @keyframes pg-slide-left  { from { opacity:0; transform:translateX(28px)  } to { opacity:1; transform:translateX(0) } }
        @keyframes pg-slide-right { from { opacity:0; transform:translateX(-28px) } to { opacity:1; transform:translateX(0) } }
      `}</style>
      {children}
    </div>
  );
}

// ── Shared computation ────────────────────────────────────────────────────────
export type HoleFilter = (holeNum: number, par: number, yards: number | null) => boolean;

export function computeRows(
  filter: HoleFilter,
  golfers: any[], events: any[], leaderboard: any[], holeScores: any[], courses: any[], selSeason: number,
  courseNameFilter?: string, signups?: any[], minHoles?: number
): { playerRows: { golfer: any; avg: number; delta: number; count: number }[]; fieldAvg: number } {
  const _minHoles = minHoles ?? MIN_HOLES_PER_SPLIT;
  const seasonEvents = events.filter((e: any) =>
    e.season === selSeason && e.status === "Completed" &&
    (!courseNameFilter || e.course_name === courseNameFilter)
  );
  const buckets: Map<number, number[]> = new Map();

  seasonEvents.forEach((ev: any) => {
    const defaultCourse = courses.find((c: any) => c.course_name === ev.course_name);
    if (!defaultCourse) return;
    const defaultPars: number[] = defaultCourse.hole_pars || [];

    const entries = leaderboard.filter((r: any) =>
      r.event_id === ev.event_id &&
      !golfers.find((g: any) => g.golfer_id === r.golfer_id)?.is_guest
    );

    entries.forEach((entry: any) => {
      const signup = signups?.find((s: any) => s.event_id === ev.event_id && s.golfer_id === entry.golfer_id);
      // Only use yardage when we know the golfer's tee box; otherwise yards stays null
      const teeCourse = signup?.tee_box_course_id
        ? courses.find((c: any) => c.course_id === signup.tee_box_course_id)
        : null;
      const pars: number[] = teeCourse?.hole_pars || defaultPars;
      const yards: number[] | null = teeCourse?.hole_yards ?? null;

      const hs = holeScores.filter((h: any) => h.summary_id === entry.summary_id);
      hs.forEach((h: any) => {
        if (h.stableford_points == null) return;
        const holeNum: number = h.hole_number;
        const par: number = pars[holeNum - 1];
        const y: number | null = yards && yards.length >= holeNum ? yards[holeNum - 1] : null;
        if (!filter(holeNum, par, y)) return;
        const bucket = buckets.get(entry.golfer_id) || [];
        bucket.push(h.stableford_points);
        buckets.set(entry.golfer_id, bucket);
      });
    });
  });

  let totalSum = 0, totalCount = 0;
  buckets.forEach(pts => { totalSum += pts.reduce((a, b) => a + b, 0); totalCount += pts.length; });
  const fieldAvg = totalCount > 0 ? totalSum / totalCount : 0;

  const playerRows: { golfer: any; avg: number; delta: number; count: number }[] = [];
  buckets.forEach((pts, gid) => {
    if (pts.length < _minHoles) return;
    const g = golfers.find((gl: any) => gl.golfer_id === gid);
    if (!g || g.is_guest) return;
    const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
    playerRows.push({ golfer: g, avg, delta: avg - fieldAvg, count: pts.length });
  });

  playerRows.sort((a, b) => b.delta - a.delta);
  return { playerRows, fieldAvg };
}

// ── Leaderboard table ─────────────────────────────────────────────────────────
function PGLeaderboard({ playerRows, fieldAvg }: { playerRows: { golfer: any; avg: number; delta: number; count: number }[]; fieldAvg: number }) {
  const fmtDelta = (d: number) => (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(2);

  const maxAbs = BAR_SCALE_MODE === "fixed"
    ? FIXED_SCALE_DELTA
    : Math.max(...playerRows.map(r => Math.abs(r.delta)), 0.01);

  if (playerRows.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "18px 0" }}>
        Not enough data for this split ({MIN_HOLES_PER_SPLIT}+ holes required per golfer).
      </div>
    );
  }

  return (
    <div>
      {/* Field avg readout */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: "9px 13px", marginBottom: 10,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Field avg</span>
        <span style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
          {fieldAvg.toFixed(2)}
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginLeft: 3 }}>pts/hole</span>
        </span>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        {/* Header row — flex mirrors the data row layout below */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "7px 14px",
          background: "var(--green-900)",
          borderRadius: "var(--radius-md) var(--radius-md) 0 0",
        }}>
          <div className="lb-header-cell" style={{ flex: "0 0 28px", textAlign: "center" }}>Pos</div>
          <div className="lb-header-cell" style={{ flex: "0 0 130px" }}>Name</div>
          <div className="lb-header-cell" style={{ flex: 1 }}></div>
          <div className="lb-header-cell right" style={{ flex: "0 0 46px" }}>Avg</div>
        </div>

        {/* Data rows */}
        {playerRows.map((row, i) => {
          const rank = i + 1;
          const pos = row.delta >= 0;
          const near0 = Math.abs(row.delta) < 0.005;
          // fillPct is relative to half the bar width; cap at 40% so label has room
          const fillPct = Math.min(40, (Math.abs(row.delta) / maxAbs) * 40);
          const deltaColor = near0 ? "var(--text-muted)" : pos ? "var(--green-600)" : "var(--red-600)";
          const rankCls = rank === 1 ? "lb-rank-cell r1" : rank === 2 ? "lb-rank-cell r2" : rank === 3 ? "lb-rank-cell r3" : "lb-rank-cell";

          return (
            <div
              key={row.golfer.golfer_id}
              className="lb-row"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "default" }}
            >
              {/* Rank */}
              <div className={rankCls} style={{ fontSize: 15, flex: "0 0 28px", textAlign: "center" }}>{rank}</div>

              {/* Name — fixed width, nowrap */}
              <div style={{ flex: "0 0 130px", minWidth: 0 }}>
                <div className="lb-name-main" style={{ fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {row.golfer.first_name} {row.golfer.last_name}
                </div>
              </div>

              {/* Track: delta superscript anchored top-right of the bar */}
              <div style={{ flex: 1, minWidth: 0, position: "relative", paddingTop: 16 }}>
                {/* Delta label — top-right corner of the track */}
                <div style={{
                  position: "absolute", top: 0, right: 0,
                  fontSize: 11, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                  color: deltaColor, whiteSpace: "nowrap", lineHeight: 1,
                }}>
                  {fmtDelta(row.delta)}
                  <span style={{ fontSize: 9, fontWeight: 600, color: "var(--text-muted)", marginLeft: 2 }}>pts</span>
                </div>
                {/* Diverging bar */}
                <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--surface2)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "var(--border-md)", transform: "translateX(-1px)", zIndex: 2 }} />
                  {pos ? (
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: `${fillPct}%`, borderRadius: "0 4px 4px 0", background: "linear-gradient(90deg,var(--green-500),var(--green-700))" }} />
                  ) : (
                    <div style={{ position: "absolute", top: 0, bottom: 0, right: "50%", width: `${fillPct}%`, borderRadius: "4px 0 0 4px", background: "linear-gradient(270deg,var(--red-400),var(--red-600))" }} />
                  )}
                </div>
              </div>

              {/* Avg */}
              <div style={{ flex: "0 0 46px", textAlign: "right" }}>
                <div className="lb-score-big" style={{ fontSize: 17 }}>{row.avg.toFixed(2)}</div>
                <div className="lb-score-label">pts</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Par sub-view with yardage bucket pills ────────────────────────────────────
function ParView({ par, golfers, events, leaderboard, holeScores, courses, signups, selSeason }: any) {
  const [ydBucket, setYdBucket] = useState("all");
  const buckets = bucketsForPar(par);
  const hasYards = courses.some((c: any) => Array.isArray(c.hole_yards) && c.hole_yards.some((y: number) => y > 0));

  // Compute which buckets have enough golfers to show, using per-golfer tee box yardage
  const visibleBuckets = useMemo(() => {
    if (!hasYards) return [];
    return buckets.filter(b => {
      const gidCounts: Map<number, number> = new Map();
      const seasonEvents = events.filter((e: any) => e.season === selSeason && e.status === "Completed");
      seasonEvents.forEach((ev: any) => {
        const defaultCourse = courses.find((c: any) => c.course_name === ev.course_name);
        if (!defaultCourse) return;
        const defaultPars: number[] = defaultCourse.hole_pars || [];
        const entries = leaderboard.filter((r: any) =>
          r.event_id === ev.event_id &&
          !golfers.find((g: any) => g.golfer_id === r.golfer_id)?.is_guest
        );
        entries.forEach((entry: any) => {
          const signup = signups?.find((s: any) => s.event_id === ev.event_id && s.golfer_id === entry.golfer_id);
          if (!signup?.tee_box_course_id) return;
          const teeCourse = courses.find((c: any) => c.course_id === signup.tee_box_course_id);
          if (!teeCourse) return;
          const pars: number[] = teeCourse.hole_pars || defaultPars;
          const yards: number[] = teeCourse.hole_yards || [];
          const hs = holeScores.filter((h: any) => h.summary_id === entry.summary_id);
          hs.forEach((h: any) => {
            if (h.stableford_points == null) return;
            const holeNum: number = h.hole_number;
            const holePar: number = pars[holeNum - 1];
            if (holePar !== par) return;
            const y: number | null = yards.length >= holeNum ? yards[holeNum - 1] : null;
            if (y === null || y < b.min || y > b.max) return;
            gidCounts.set(entry.golfer_id, (gidCounts.get(entry.golfer_id) || 0) + 1);
          });
        });
      });
      const eligibleGolfers = [...gidCounts.values()].filter(c => c >= 1).length;
      return eligibleGolfers >= MIN_GOLFERS_FOR_BUCKET;
    });
  }, [par, hasYards, buckets, golfers, events, leaderboard, holeScores, courses, signups, selSeason]);

  // Reset to "all" if current bucket disappears
  const activeBucket = visibleBuckets.find(b => b.label === ydBucket) ? ydBucket : "all";

  const filter: HoleFilter = useMemo(() => {
    if (activeBucket === "all") {
      return (_h, p) => p === par;
    }
    const b = visibleBuckets.find(bk => bk.label === activeBucket);
    if (!b) return (_h, p) => p === par;
    return (_h, p, y) => p === par && y !== null && y >= b.min && y <= b.max;
  }, [par, activeBucket, visibleBuckets]);

  const minHoles = activeBucket === "all" ? MIN_HOLES_PER_SPLIT : MIN_HOLES_PER_YARD_BUCKET;
  const { playerRows, fieldAvg } = useMemo(
    () => computeRows(filter, golfers, events, leaderboard, holeScores, courses, selSeason, undefined, signups, minHoles),
    [filter, golfers, events, leaderboard, holeScores, courses, selSeason, signups, minHoles]
  );

  return (
    <div>
      {/* Yardage bucket pills — only when there are visible buckets */}
      {visibleBuckets.length > 0 && (
        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" as any }}>
          <button
            onClick={() => setYdBucket("all")}
            className={"tab-sub-btn" + (activeBucket === "all" ? " active" : "")}
            style={{ padding: "5px 13px", fontSize: 12 }}
          >
            ALL
          </button>
          {visibleBuckets.map(b => (
            <button
              key={b.label}
              onClick={() => setYdBucket(b.label)}
              className={"tab-sub-btn" + (activeBucket === b.label ? " active" : "")}
              style={{ padding: "5px 13px", fontSize: 12 }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      <PGLeaderboard playerRows={playerRows} fieldAvg={fieldAvg} />
    </div>
  );
}

// ── Course view with per-hole subtabs ────────────────────────────────────────
const HOLES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];

function CourseView({ courseName, golfers, events, leaderboard, holeScores, courses, signups, selSeason }: any) {
  const [holeTab, setHoleTab] = useState("all");
  const activeHole = holeTab === "all" ? null : parseInt(holeTab);

  const filter: HoleFilter = useMemo(() => {
    if (activeHole === null) return () => true;
    return (h) => h === activeHole;
  }, [activeHole]);

  // For a single hole the min-holes threshold is too strict; use 1 for single-hole
  const minHoles = activeHole === null ? MIN_HOLES_PER_SPLIT : 1;

  const { playerRows: rawRows, fieldAvg } = useMemo(
    () => computeRows(filter, golfers, events, leaderboard, holeScores, courses, selSeason, courseName, signups),
    [filter, golfers, events, leaderboard, holeScores, courses, selSeason, courseName, signups]
  );

  // Re-apply minHoles threshold (computeRows always uses MIN_HOLES_PER_SPLIT)
  const playerRows = useMemo(() => {
    if (activeHole === null) return rawRows;
    // For per-hole view recompute without the MIN_HOLES gate
    const seasonEvents = events.filter((e: any) =>
      e.season === selSeason && e.status === "Completed" && e.course_name === courseName
    );
    const buckets: Map<number, number[]> = new Map();
    seasonEvents.forEach((ev: any) => {
      const entries = leaderboard.filter((r: any) =>
        r.event_id === ev.event_id &&
        !golfers.find((g: any) => g.golfer_id === r.golfer_id)?.is_guest
      );
      entries.forEach((entry: any) => {
        const hs = holeScores.filter((h: any) => h.summary_id === entry.summary_id && h.hole_number === activeHole);
        hs.forEach((h: any) => {
          if (h.stableford_points == null) return;
          const bucket = buckets.get(entry.golfer_id) || [];
          bucket.push(h.stableford_points);
          buckets.set(entry.golfer_id, bucket);
        });
      });
    });
    let totalSum = 0, totalCount = 0;
    buckets.forEach(pts => { totalSum += pts.reduce((a, b) => a + b, 0); totalCount += pts.length; });
    const fa = totalCount > 0 ? totalSum / totalCount : 0;
    const rows: { golfer: any; avg: number; delta: number; count: number }[] = [];
    buckets.forEach((pts, gid) => {
      if (pts.length < minHoles) return;
      const g = golfers.find((gl: any) => gl.golfer_id === gid);
      if (!g || g.is_guest) return;
      const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
      rows.push({ golfer: g, avg, delta: avg - fa, count: pts.length });
    });
    rows.sort((a, b) => b.delta - a.delta);
    return rows;
  }, [activeHole, rawRows, golfers, events, leaderboard, holeScores, selSeason, courseName, minHoles]);

  const holeTabs = [{ id: "all", label: "ALL" }, ...HOLES.map(n => ({ id: String(n), label: String(n) }))];

  return (
    <div>
      {/* Hole subtabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" as any }}>
        {holeTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setHoleTab(t.id)}
            className={"tab-sub-btn" + (holeTab === t.id ? " active" : "")}
            style={{ padding: "5px 11px", fontSize: 12, minWidth: 36 }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <PGLeaderboard playerRows={playerRows} fieldAvg={fieldAvg} />
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
type MetricDef = { id: string; label: string; filter: HoleFilter };

// Shared chevron SVG
function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

// One row per metric: shows the leader in lb-row style
function OverviewSection({ defs, golfers, events, leaderboard, holeScores, courses, signups, selSeason, onNavigate, seasonData }: { defs: MetricDef[]; onNavigate: (id: string) => void } & any) {
  const fmtDelta = (d: number) => (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(2);

  // Compute all metrics up front — course categories scope by course name
  const courseFilter: Record<string, string> = { strawberry: STRAWBERRY, oakcreek: OAK_CREEK };
  const allData = defs.map((def: MetricDef) =>
    computeRows(def.filter, golfers, events, leaderboard, holeScores, courses, selSeason, courseFilter[def.id], signups)
  );

  // Compute consistency leader from seasonData
  const consistencyRows = (seasonData || []).map((d: any) => {
    if (d.allPts.length < 3) return null;
    const avg = d.allPts.reduce((a: number, b: number) => a + b, 0) / d.allPts.length;
    const variance = d.allPts.reduce((s: number, p: number) => s + (p - avg) ** 2, 0) / d.allPts.length;
    const stdDev = Math.sqrt(variance);
    return { golfer: d.golfer, stdDev };
  }).filter(Boolean).sort((a: any, b: any) => a.stdDev - b.stdDev);

  const leagueStdDevAvg = consistencyRows.length > 0
    ? consistencyRows.reduce((s: number, r: any) => s + r.stdDev, 0) / consistencyRows.length
    : null;
  const consistencyLeader = consistencyRows[0] || null;
  const consistencyDelta = consistencyLeader && leagueStdDevAvg != null
    ? consistencyLeader.stdDev - leagueStdDevAvg
    : null;

  const renderMetricRow = (def: MetricDef, i: number) => {
    const { playerRows } = allData[i];
    const leader = playerRows[0] || null;
    return (
      <div
        key={def.id}
        className="lb-row"
        onClick={() => onNavigate(def.id)}
        style={{ gridTemplateColumns: "1fr 36px 52px 28px", padding: "11px 14px", cursor: "pointer" }}
      >
        <div className="lb-name-cell">
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--green-700)", marginBottom: 3, textAlign: "left" }}>
            {def.label}
          </div>
          {leader ? (
            <div className="lb-name-main" style={{ fontSize: 15 }}>
              {leader.golfer.first_name} {leader.golfer.last_name}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No data</div>
          )}
        </div>
        <div className="lb-score-cell">
          {leader && (
            <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: leader.delta >= 0 ? "var(--green-600)" : "var(--red-600)", lineHeight: 1 }}>
              {fmtDelta(leader.delta)}
            </div>
          )}
        </div>
        <div className="lb-score-cell">
          {leader && (
            <div className="lb-score-big" style={{ fontSize: 17 }}>{leader.avg.toFixed(2)}</div>
          )}
        </div>
        <div style={{ width: 28, display: "flex", alignItems: "center", justifyContent: "flex-end", flexShrink: 0, color: "var(--text-muted)" }}>
          <Chevron />
        </div>
      </div>
    );
  };

  // Split defs at the back9/strawberry boundary so consistency slots between them
  const back9Idx = defs.findIndex((d: MetricDef) => d.id === "back9");
  const beforeConsistency = back9Idx >= 0 ? defs.slice(0, back9Idx + 1) : defs;
  const afterConsistency  = back9Idx >= 0 ? defs.slice(back9Idx + 1) : [];

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 12 }}>
      {/* Header */}
      <div className="lb-header" style={{ gridTemplateColumns: "1fr 36px 52px 28px" }}>
        <div className="lb-header-cell">Leader</div>
        <div className="lb-header-cell right">+/-</div>
        <div className="lb-header-cell right">Avg</div>
        <div className="lb-header-cell"></div>
      </div>

      {beforeConsistency.map((def: MetricDef, i: number) => renderMetricRow(def, i))}

      {/* Consistency row — between back9 and strawberry */}
      <div
        className="lb-row"
        onClick={() => onNavigate("consistency")}
        style={{ gridTemplateColumns: "1fr 36px 52px 28px", padding: "11px 14px", cursor: "pointer" }}
      >
        <div className="lb-name-cell">
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--green-700)", marginBottom: 3, textAlign: "left" }}>
            Consistency
          </div>
          {consistencyLeader ? (
            <div className="lb-name-main" style={{ fontSize: 15 }}>
              {consistencyLeader.golfer.first_name} {consistencyLeader.golfer.last_name}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No data</div>
          )}
        </div>
        <div className="lb-score-cell">
          {consistencyLeader && consistencyDelta != null && (
            <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: consistencyDelta <= 0 ? "var(--green-600)" : "var(--red-600)", lineHeight: 1 }}>
              {(consistencyDelta >= 0 ? "+" : "−") + Math.abs(consistencyDelta).toFixed(2)}
            </div>
          )}
        </div>
        <div className="lb-score-cell">
          {consistencyLeader && (
            <div className="lb-score-big" style={{ fontSize: 17 }}>{consistencyLeader.stdDev.toFixed(2)}</div>
          )}
        </div>
        <div style={{ width: 28, display: "flex", alignItems: "center", justifyContent: "flex-end", flexShrink: 0, color: "var(--text-muted)" }}>
          <Chevron />
        </div>
      </div>

      {afterConsistency.map((def: MetricDef, i: number) => renderMetricRow(def, back9Idx + 1 + i))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const STRAWBERRY = "Strawberry Farms GC";
const OAK_CREEK  = "Oak Creek GC";

const TOP_TABS = [
  { id: "overview",     label: "OVERVIEW"    },
  { id: "par3",         label: "PAR 3'S"     },
  { id: "par4",         label: "PAR 4'S"     },
  { id: "par5",         label: "PAR 5'S"     },
  { id: "front9",       label: "FRONT 9"     },
  { id: "back9",        label: "BACK 9"      },
  { id: "consistency",  label: "CONSISTENCY" },
  { id: "strawberry",   label: "STRAWBERRY"  },
  { id: "oakcreek",     label: "OAK CREEK"   },
];

const METRIC_DEFS: MetricDef[] = [
  { id: "par3",        label: "Par 3's",        filter: (_h, p) => p === 3 },
  { id: "par4",        label: "Par 4's",        filter: (_h, p) => p === 4 },
  { id: "par5",        label: "Par 5's",        filter: (_h, p) => p === 5 },
  { id: "front9",      label: "Front 9",        filter: (h) => h >= 1 && h <= 9 },
  { id: "back9",       label: "Back 9",         filter: (h) => h >= 10 && h <= 18 },
  { id: "strawberry",  label: "Strawberry Farms", filter: () => true },
  { id: "oakcreek",    label: "Oak Creek",      filter: () => true },
];

export function PointsGained({ golfers, events, leaderboard, holeScores, courses, signups, selSeason, initialTab, seasonData }: any) {
  const [activeTab, setActiveTab] = useState(initialTab || "overview");
  const [slideDir, setSlideDir] = useState<"left"|"right"|"none">("none");
  const [showSkeleton, setShowSkeleton] = useState(false);
  const prevTabIdx = useRef(0);
  const skeletonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateTo = (id: string) => {
    const newIdx = TOP_TABS.findIndex(t => t.id === id);
    const oldIdx = prevTabIdx.current;
    setSlideDir(newIdx > oldIdx ? "left" : newIdx < oldIdx ? "right" : "none");
    prevTabIdx.current = newIdx;
    setShowSkeleton(true);
    if (skeletonTimer.current) clearTimeout(skeletonTimer.current);
    skeletonTimer.current = setTimeout(() => setShowSkeleton(false), 180);
    setActiveTab(id);
  };

  const noData = events.filter((e: any) => e.season === selSeason && e.status === "Completed").length === 0;

  // Memoize filter for non-par tabs so PGLeaderboard renders cleanly
  const frontFilter: HoleFilter = useMemo(() => (h) => h >= 1 && h <= 9, []);
  const backFilter: HoleFilter = useMemo(() => (h) => h >= 10 && h <= 18, []);

  const frontData = useMemo(
    () => computeRows(frontFilter, golfers, events, leaderboard, holeScores, courses, selSeason, undefined, signups),
    [frontFilter, golfers, events, leaderboard, holeScores, courses, selSeason, signups]
  );
  const backData = useMemo(
    () => computeRows(backFilter, golfers, events, leaderboard, holeScores, courses, selSeason, undefined, signups),
    [backFilter, golfers, events, leaderboard, holeScores, courses, selSeason, signups]
  );

  const commonProps = { golfers, events, leaderboard, holeScores, courses, signups, selSeason };

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 2 }}>Points Gained</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.4 }}>
        Avg Stableford pts per hole vs. the field, by split.
      </p>

      {noData ? (
        <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14, padding: 24 }}>
          No completed events this season.
        </div>
      ) : (
        <>
          <InkNav tabs={TOP_TABS} active={activeTab} onChange={navigateTo} />

          {showSkeleton ? <PGSkeleton /> : (
            <PGSlide dir={slideDir}>
              {activeTab === "overview" && (
                <div>
                  <OverviewSection defs={METRIC_DEFS} {...commonProps} onNavigate={navigateTo} seasonData={seasonData} />
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 11.5, paddingBottom: 8, lineHeight: 1.5 }}>
                    Season {selSeason} &middot; guests excluded &middot; min {MIN_HOLES_PER_SPLIT} holes per split
                  </div>
                </div>
              )}

              {activeTab === "par3" && <ParView par={3} {...commonProps} />}
              {activeTab === "par4" && <ParView par={4} {...commonProps} />}
              {activeTab === "par5" && <ParView par={5} {...commonProps} />}

              {activeTab === "front9" && (
                <>
                  <PGLeaderboard playerRows={frontData.playerRows} fieldAvg={frontData.fieldAvg} />
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 11.5, paddingTop: 6, paddingBottom: 8 }}>
                    Season {selSeason} &middot; guests excluded
                  </div>
                </>
              )}

              {activeTab === "back9" && (
                <>
                  <PGLeaderboard playerRows={backData.playerRows} fieldAvg={backData.fieldAvg} />
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 11.5, paddingTop: 6, paddingBottom: 8 }}>
                    Season {selSeason} &middot; guests excluded
                  </div>
                </>
              )}

              {activeTab === "consistency" && <ConsistencyTable seasonData={seasonData} />}

              {activeTab === "strawberry" && <CourseView courseName={STRAWBERRY} {...commonProps} />}
              {activeTab === "oakcreek" && <CourseView courseName={OAK_CREEK} {...commonProps} />}
            </PGSlide>
          )}
        </>
      )}
    </div>
  );
}
