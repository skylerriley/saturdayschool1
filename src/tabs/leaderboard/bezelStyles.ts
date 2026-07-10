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
// NOTE (2026-07-10): drop shadows removed per request — the raised look now
// comes from the gradient (dark cards) + inset rim alone. To restore the lift,
// put these values back:
//   OUTER: "0 1px 1px rgba(0,0,0,0.04), 0 4px 8px -2px rgba(0,0,0,0.10), 0 8px 16px -6px rgba(0,0,0,0.10)"
//   PILL:  "0 1px 2px rgba(0,0,0,0.18), 0 2px 5px rgba(0,0,0,0.12)"
export const BEZEL_OUTER_SHADOW = "none";

// Tighter, crisper lift — matches the segmented-control (ToggleGroup) pill.
// (Drop shadow removed 2026-07-10 — see note above for the original value.)
export const BEZEL_PILL_SHADOW = "none";

// The exact box-shadow on the ToggleGroup (Profile/Settings segmented control)
// container in App.tsx (.toggle-group) — outer drop-shadow lift + a light inset
// rim (bright top edge, faint dark bottom). Use on light/warm inner surfaces
// that should read as raised the same way the segmented control does.
export const BEZEL_TOGGLE_LIGHT =
  "0 1px 2px -1px rgba(0,0,0,0.05), 0 2px 5px -3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.06)";

// Same raised bezel as BEZEL_TOGGLE_LIGHT, meant for small colored chips/pills
// (RSVP info-card status/tee/field chips) where the chip keeps its own tint —
// soft outer drop + a light inset rim so the chip reads as raised.
export const CHIP_BEZEL = BEZEL_TOGGLE_LIGHT;

// Raised-button bezels — for action buttons (admin email/notify/reminder,
// clear/regenerate pairings, send push, view scorecards). Same rim language as
// the segmented control: bright top edge + faint bottom edge, plus a soft outer
// lift, so the button reads as a physical raised key.
//   BEZEL_BTN_LIGHT  — outline / transparent / cream buttons (dark-on-light).
//   BEZEL_BTN_STRONG — filled colored buttons (green primary, red danger),
//                      where the rim uses whites on both edges so it stays
//                      legible against the saturated fill.
export const BEZEL_BTN_LIGHT =
  "0 1px 2px -1px rgba(0,0,0,0.06), 0 2px 6px -3px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.08)";
export const BEZEL_BTN_STRONG =
  "0 1px 2px rgba(0,0,0,0.12), 0 3px 7px -2px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.10)";

// Depressed (pressed-in) bezel for tiny circular badges — the G (guest) / E
// (early) badges on the RSVP "Field" player chips. The inverse of the raised
// rim: a dark inset at the TOP edge + a light inset at the BOTTOM edge makes the
// badge read as recessed/stamped into the chip. Applied inline on the badges.
export const BADGE_DEPRESSED_BEZEL =
  "inset 0 1px 2px rgba(0,0,0,0.45), inset 0 -1px 0 rgba(255,255,255,0.25)";

// Raised bezel for the small gold skin squares in the "Skins Won" / "Live Skins"
// grids. These are tiny saturated gold tiles that should read as physically
// raised off the card, so we combine a soft outer drop (to lift the square off
// the surface) with a rim inset: a bright top edge + a dark bottom edge, giving
// the beveled/raised-key look. Applied inline on the gold cells only.
export const SKIN_SQUARE_BEZEL =
  "0 1px 1px rgba(0,0,0,0.10), 0 2px 4px -1px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 1px rgba(0,0,0,0.22)";

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
