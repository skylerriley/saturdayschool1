import React from "react";

// Inject shimmer keyframe once
let shimmerInjected = false;
export function ensureShimmer() {
  if (shimmerInjected) return;
  shimmerInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes wx-shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    .wx-skel {
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0.08) 25%,
        rgba(255,255,255,0.22) 50%,
        rgba(255,255,255,0.08) 75%
      );
      background-size: 200% 100%;
      animation: wx-shimmer 1.6s ease infinite;
      border-radius: 6px;
    }
  `;
  document.head.appendChild(s);
}

interface WeatherSkeletonProps {
  style?: React.CSSProperties;
}

/**
 * Shimmer skeleton that mimics the weather forecast row layout:
 *   [icon] [temp] [condition] ········ [wind]
 * Used in RSVPTab while weather data is loading.
 */
export function WeatherSkeleton({ style }: WeatherSkeletonProps) {
  ensureShimmer();
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        ...style,
      }}
    >
      {/* icon placeholder */}
      <div className="wx-skel" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
      {/* temp placeholder */}
      <div className="wx-skel" style={{ width: 44, height: 16, borderRadius: 6, flexShrink: 0 }} />
      {/* condition text placeholder */}
      <div className="wx-skel" style={{ width: 90, height: 14, borderRadius: 6, flexShrink: 0 }} />
      {/* spacer */}
      <div style={{ flex: 1 }} />
      {/* wind placeholder */}
      <div className="wx-skel" style={{ width: 56, height: 14, borderRadius: 6, flexShrink: 0 }} />
    </div>
  );
}

/**
 * Skeleton bar used inside UpcomingCourseCard image overlay.
 * Mimics the small weather pill / badge that appears on the photo.
 */
export function WeatherBadgeSkeleton({ style }: WeatherSkeletonProps) {
  ensureShimmer();
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
    >
      <div className="wx-skel" style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0 }} />
      <div className="wx-skel" style={{ width: 72, height: 14, borderRadius: 6 }} />
    </div>
  );
}
