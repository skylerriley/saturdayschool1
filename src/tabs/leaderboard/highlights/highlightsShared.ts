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

export function holeAerialUrl(holeImages: any[], courseName: string, hole: number): string | null {
  const rec = (holeImages || []).find((img: any) => img.course_name === courseName && img.hole_number === hole && img.public_url);
  return rec ? rec.public_url : null;
}
