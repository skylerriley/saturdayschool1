// Shared non-component exports for the highlights feature (kept out of the
// component files so react-refresh stays happy).
import type { DataBeat } from "../../../lib/recapEngine";

// Feature flag: 'admin' => only admin-unlocked devices see the module.
// Flip to 'all' to roll out to members.
export const HIGHLIGHTS_AUDIENCE: "admin" | "all" = "admin";

export function highlightsEnabled(adminMode: boolean): boolean {
  return HIGHLIGHTS_AUDIENCE === "all" || (HIGHLIGHTS_AUDIENCE === "admin" && adminMode);
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
