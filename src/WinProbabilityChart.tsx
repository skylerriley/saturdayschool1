import { useEffect, useRef, useState, useMemo } from "react";
import {
  Chart,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from "chart.js";

Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

const COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#e34948", "#eb6834"];
const TRIALS = 600;

interface WinProbabilityChartProps {
  eventId: number | string;
  players: Array<{
    id: number | string;
    name: string;
  }>;
  holeScores: Array<{
    player_id: number | string;
    hole_number: number;
    stableford_points: number;
  }>;
}

function simulate(currentTotals: number[], holesLeft: number): number[] {
  const wins = new Array(currentTotals.length).fill(0);
  for (let t = 0; t < TRIALS; t++) {
    const finals = currentTotals.map((total) => {
      let extra = 0;
      for (let h = 0; h < holesLeft; h++) {
        const r = Math.random();
        extra += r < 0.12 ? 0 : r < 0.48 ? 1 : r < 0.78 ? 2 : r < 0.92 ? 3 : 4;
      }
      return total + extra;
    });
    const best = Math.max(...finals);
    const winners = finals.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    winners.forEach((i) => (wins[i] += 1 / winners.length));
  }
  return wins.map((w) => Math.round((w / TRIALS) * 100));
}

function buildDisplayNames(players: Array<{ id: number | string; name: string }>): string[] {
  const firstNames = players.map((p) => p.name.trim().split(" ")[0]);
  const counts: Record<string, number> = {};
  firstNames.forEach((fn) => { counts[fn] = (counts[fn] || 0) + 1; });
  return players.map((p) => {
    const parts = p.name.trim().split(" ");
    const first = parts[0];
    if (counts[first] > 1 && parts.length > 1) {
      return `${first} ${parts[parts.length - 1][0]}.`;
    }
    return first;
  });
}

export function WinProbabilityChart({ eventId, players, holeScores }: WinProbabilityChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [seriesData, setSeriesData] = useState<number[][] | null>(null);

  const maxHole = useMemo(() => {
    if (!holeScores.length) return 0;
    return Math.max(...holeScores.map((s) => s.hole_number));
  }, [holeScores]);

  const distinctPlayers = useMemo(() => {
    const ids = new Set(holeScores.map((s) => String(s.player_id)));
    return players.filter((p) => ids.has(String(p.id)));
  }, [players, holeScores]);

  const displayNames = useMemo(() => buildDisplayNames(distinctPlayers), [distinctPlayers]);

  useEffect(() => {
    if (holeScores.length === 0 || distinctPlayers.length < 2 || maxHole < 3) return;

    const cacheKey = `wp_${eventId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setSeriesData(JSON.parse(cached));
        return;
      }
    } catch (e: any) {}

    const playerIds = distinctPlayers.map((p) => p.id);
    const n = playerIds.length;

    const checkpoints: number[][] = [];
    checkpoints.push(new Array(n).fill(0));

    for (let hole = 1; hole <= maxHole; hole++) {
      const prev = checkpoints[checkpoints.length - 1];
      const next = prev.map((total, idx) => {
        const pid = playerIds[idx];
        const hs = holeScores.find(
          (s) => String(s.player_id) === String(pid) && s.hole_number === hole
        );
        return total + (hs ? hs.stableford_points : 0);
      });
      checkpoints.push(next);
    }

    const series: number[][] = Array.from({ length: n }, () => []);
    checkpoints.forEach((totals, holeIdx) => {
      const holesLeft = 18 - holeIdx;
      const probs = simulate(totals, holesLeft);
      probs.forEach((p, i) => series[i].push(p));
    });

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(series));
    } catch (e: any) {}

    setSeriesData(series);
  }, [eventId, holeScores, distinctPlayers, maxHole]);

  useEffect(() => {
    if (!seriesData || !canvasRef.current || distinctPlayers.length < 2) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const labels: (string | number)[] = ["Start"];
    for (let h = 1; h <= maxHole; h++) labels.push(h);

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: distinctPlayers.map((p, i) => ({
          label: displayNames[i],
          data: seriesData[i],
          borderColor: COLORS[i % COLORS.length],
          backgroundColor: COLORS[i % COLORS.length] + "15",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
          fill: i === 0,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items: any[]) =>
                items[0].dataIndex === 0 ? "Start" : `Hole ${items[0].dataIndex}`,
              label: (item: any) => `${item.dataset.label}: ${item.raw}%`,
            },
          },
        },
        scales: {
          x: { display: false },
          y: {
            min: 0,
            max: 100,
            display: false,
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [seriesData, distinctPlayers, displayNames, maxHole]);

  if (holeScores.length === 0 || distinctPlayers.length < 2 || maxHole < 3) return null;
  if (!seriesData) return null;

  const sortedPlayers = distinctPlayers
    .map((p, i) => ({
      ...p,
      displayName: displayNames[i],
      color: COLORS[i % COLORS.length],
      finalPct: seriesData[i][seriesData[i].length - 1] ?? 0,
    }))
    .sort((a, b) => b.finalPct - a.finalPct);

  return (
    <div style={{ marginTop: 14, paddingBottom: 100 }}>
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", padding: "14px 12px", boxShadow: "var(--shadow-sm)" }}>
        <div className="card-title" style={{ marginBottom: 10, textAlign: "center" }}>
          Win Probability
        </div>

        <div style={{ position: "relative", width: "100%", height: 300 }}>
          <canvas ref={canvasRef} role="img" aria-label="Win probability over 18 holes" />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 2px 10px",
            fontSize: 9,
            color: "var(--text-muted, #898781)",
          }}
        >
          {[1, 3, 6, 9, 12, 15, 18].map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
          {sortedPlayers.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: p.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {p.displayName}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
