// Shared iOS-widget "bezel" styling used by the upcoming-leaderboard cards
// (field strength, hero image, RSVP/rankings, event odds).
//
// The look has two parts:
//   1. An outer drop shadow that lifts the card off the background. Negative
//      spread on the wider layers contracts them horizontally so they fade out
//      before reaching .main-content's overflow-x:clip gutter — without this
//      they get sliced into a hard vertical edge at the left/right guards.
//   2. An inset rim: a bright top edge + a dark bottom edge, so the card reads
//      as raised. On cards whose inner content is inset:0 (image/dark table
//      cards), the rim must be a separate top-most, pointer-events:none overlay
//      (see BEZEL_RIM_OVERLAY) — otherwise the content paints over it.

import type { CSSProperties } from "react";

// Outer lift — put this on a wrapper that does NOT clip overflow.
export const BEZEL_OUTER_SHADOW =
  "0 1px 1px rgba(0,0,0,0.04), 0 4px 8px -2px rgba(0,0,0,0.10), 0 8px 16px -6px rgba(0,0,0,0.10)";

// Tighter, crisper lift — matches the segmented-control (ToggleGroup) pill.
// Two close positive-offset layers instead of a wide diffuse spread, so the
// card sits just above the surface with a sharper edge. Pair with the "pill"
// rim below. Can render directly on the card (no negative-spread gutter risk
// since the blur radius stays small).
export const BEZEL_PILL_SHADOW =
  "0 1px 2px rgba(0,0,0,0.18), 0 2px 5px rgba(0,0,0,0.12)";

// Rim overlay for DARK cards (green-900 surfaces / photos). Softer whites so the
// highlight doesn't blow out against the dark body.
//   radius:   corner radius to match the host card.
//   strength: "soft" (photos, where a bright line reads as glare) or "strong"
//             (flat dark UI cards like the odds panel, where the Apple-style
//             raised edge needs to actually be legible).
export const bezelRimOverlay = (
  radius = "var(--radius-md)",
  strength: "soft" | "strong" | "light" | "pill" = "soft",
): CSSProperties => ({
  position: "absolute",
  inset: 0,
  zIndex: 3,
  pointerEvents: "none",
  borderRadius: radius,
  boxShadow:
    strength === "strong"
      // Dark UI / colored cards — a light hairline on BOTH the top and bottom
      // edges (brighter up top), matching the Apple-widget bezel where the rim
      // catches light all the way around rather than darkening at the bottom.
      ? "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(255,255,255,0.22)"
      : strength === "light"
        // LIGHT (white/cream) cards — a hair of white up top, faint dark bottom
        ? "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.06)"
        : strength === "pill"
          // Matches the ToggleGroup pill — softer light-both-ends rim, pairs
          // with BEZEL_PILL_SHADOW for the crisper segmented-control look.
          ? "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.10)"
          // photos — soft, so a bright line doesn't read as glare
          : "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.35)",
});
