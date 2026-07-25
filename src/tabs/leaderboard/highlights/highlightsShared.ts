// Shared non-component exports for the highlights feature (kept out of the
// component files so react-refresh stays happy).
import type { DataBeat } from "../../../lib/recapEngine";

// Feature flag: 'admin' => only admin-unlocked devices see the module;
// 'all' => visible to every member. Rolled out to all members 2026-07-25.
export const HIGHLIGHTS_AUDIENCE: "admin" | "all" = "all";

export function highlightsEnabled(adminMode: boolean): boolean {
  return HIGHLIGHTS_AUDIENCE === "all" || (HIGHLIGHTS_AUDIENCE === "admin" && adminMode);
}

// Post-round freshness window (Handoff #17). Extracted from the leaderboard's
// existing "post-round decay" shimmer (LeaderboardTab renderLbRow) so the two
// share ONE time calculation rather than duplicating it -- same event.date
// basis, same Date.now() client clock, same default 36h threshold. The league
// has no `completed_at`, so completion is dated from event.date at local
// midnight; this is a CLIENT-TIME window, not server-enforced (acceptable for a
// private league, but stated). Returns false for a missing/absent date.
export const POST_ROUND_WINDOW_HOURS = 36;
export function hoursSinceEvent(event: { date?: string } | null | undefined): number | null {
  if (!event?.date) return null;
  const t = new Date(event.date + "T00:00:00").getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 3600000;
}
export function withinPostRoundWindow(event: { date?: string } | null | undefined, hours: number = POST_ROUND_WINDOW_HOURS): boolean {
  const h = hoursSinceEvent(event);
  return h != null && h >= 0 && h < hours;
}

// One card in the unified watch model (merged, sorted array the viewer plays).
export interface RecapCard {
  kind: "data" | "human";
  beat?: DataBeat;
  row?: any;
  hole: number | null;
  preRound: boolean;
  isFinal: boolean;
  createdAt: string | null;
}

// hole_images rows carry view_type (Handoff #11 taxonomy):
//   artistic : beauty shot -- cards + the blurred highlight BACKGROUND. Never traced.
//   hole     : full layout -- focus card + tracer (needs anchors).
//   green    : green-only -- focus card + tracer on birdies (needs anchors).
//   course   : routing map, one per course (no consumer yet).
// Legacy rows (view_type NULL) were backfilled to 'artistic' by the taxonomy
// migration; a NULL that survives (un-migrated DB) is treated as artistic here
// so it keeps serving as a background rather than being wrongly traced.
export function isArtisticView(img: any): boolean {
  return img.view_type == null || img.view_type === "artistic";
}

// Layout rows for the tracer (hole/green). NOT artistic -- an artistic image
// must never receive a tracer (Handoff #11 sec 2).
export function holeImageRow(holeImages: any[], courseName: string, hole: number, view: "hole" | "green"): any | null {
  return (holeImages || []).find((img: any) =>
    img.course_name === courseName && img.hole_number === hole && img.public_url && img.view_type === view,
  ) || null;
}

// The ARTISTIC background for a hole; falls back to any artistic image on the
// course when this hole has none.
export function artisticRow(holeImages: any[], courseName: string, hole: number): any | null {
  const rows = holeImages || [];
  return rows.find((img: any) => img.course_name === courseName && img.hole_number === hole && img.public_url && isArtisticView(img))
    || rows.find((img: any) => img.course_name === courseName && img.public_url && isArtisticView(img))
    || null;
}

export function holeAerialUrl(holeImages: any[], courseName: string, hole: number): string | null {
  const rec = artisticRow(holeImages, courseName, hole);
  return rec ? rec.public_url : null;
}

// Any artistic image for the course (course-level background fallback).
export function courseArtisticUrl(holeImages: any[], courseName: string): string | null {
  const rec = (holeImages || []).find((img: any) => img.course_name === courseName && img.public_url && isArtisticView(img));
  return rec ? rec.public_url : null;
}
