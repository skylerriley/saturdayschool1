import { useMemo } from "react";
import { formatDate } from "../../lib/formatters";
import { useWeather } from "../../hooks/useWeather";
import { wmoToDesc } from "../../components/weather/weatherUtils";
import { WeatherBadgeSkeleton } from "../../components/weather/WeatherSkeleton";
import { useWeatherReady } from "../../hooks/useWeatherReady";
import { useCachedImage } from "../../lib/imageCache";

// ------------------------------------------------------------------
// UPCOMING COURSE CARD -- rounded hero image (random hole photo) with
// course name, longest-tee yardage, par, and event-date weather overlay.
// ------------------------------------------------------------------
export function UpcomingCourseCard({ event, courses, holeImages, onClick, fieldCount, firstTeeTime }: any) {
  const courseName = event?.course_name || "";
  const courseImages = (holeImages || []).filter((img: any) => img.course_name === courseName && img.public_url && (img.view_type == null || img.view_type === "hole"));
  // Deterministic pick (hashed off the course name) instead of random, so the
  // same photo is chosen on every mount — that keeps the session image cache
  // warm and lets the card appear instantly on revisit instead of re-loading.
  const randomImg = useMemo(() => {
    if (!courseImages.length) return null;
    let h = 0;
    for (let i = 0; i < courseName.length; i++) h = (h * 31 + courseName.charCodeAt(i)) | 0;
    const idx = Math.abs(h) % courseImages.length;
    return courseImages[idx];
  }, [courseName, courseImages.length]);

  const imgUrl: string | null = randomImg?.public_url || null;
  const { loaded: imgLoaded, onLoad: onImgLoad } = useCachedImage(imgUrl);

  const courseTees = courses.filter((c: any) => c.course_name === courseName);
  const longestTee = courseTees.reduce((best: any, c: any) => {
    const yards = (c.hole_yards || []).reduce((a: number, b: number) => a + (b || 0), 0);
    const bestYards = (best?.hole_yards || []).reduce((a: number, b: number) => a + (b || 0), 0);
    return yards > bestYards ? c : best;
  }, courseTees[0]);
  const totalYards = (longestTee?.hole_yards || []).reduce((a: number, b: number) => a + (b || 0), 0);
  const par = longestTee?.par;

  const { wx } = useWeather(courseName, event?.date || "", firstTeeTime);
  const wxReady = useWeatherReady(wx);

  return (
   <div style={{
     borderRadius: "var(--radius-lg, 16px)",
     marginBottom: 14,
     // Drop-shadow lift removed 2026-07-10 — the bezel rim (overlay on the inner
     // div) provides the raised edge. To restore the lift, add here:
     //   boxShadow: "0 1px 1px rgba(0,0,0,0.04), 0 4px 8px -2px rgba(0,0,0,0.10), 0 8px 16px -6px rgba(0,0,0,0.10)"
   }}>
    <div onClick={onClick} style={{ position: "relative", borderRadius: "var(--radius-lg, 16px)", overflow: "hidden", minHeight: 160, background: "linear-gradient(135deg,var(--green-900),var(--green-700))", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
      {/* Shimmer placeholder — visible until the photo decodes */}
      {imgUrl && !imgLoaded && (
        <div className="wx-skel" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
      )}
      {imgUrl && (
        <img src={imgUrl} alt={courseName}
          loading="eager"
          decoding="async"
          onLoad={onImgLoad}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 70%",
            opacity: imgLoaded ? 1 : 0, transition: "opacity 0.4s ease" }} />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.65))" }} />
      {fieldCount != null && fieldCount > 0 && (
        <div style={{
          position: "absolute", top: 10, right: 10, zIndex: 2,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
          borderRadius: 20, padding: "3px 9px",
          fontSize: 12, fontWeight: 700, color: "white",
          letterSpacing: "0.03em", lineHeight: 1.5,
          border: "1px solid rgba(255,255,255,0.18)",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          {fieldCount}
        </div>
      )}
      <div style={{ position: "relative", padding: "14px 16px", minHeight: 160, display: "flex", flexDirection: "column", justifyContent: "flex-end", color: "white" }}>
        <div style={{ fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.85, marginBottom: 4 }}>{formatDate(event?.date)}</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{courseName}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 16, alignItems: "center", justifyContent: "center" }}>
          {totalYards > 0 && <span>{totalYards.toLocaleString()} yds</span>}
          {par && <span>Par {par}</span>}
          {/* Fixed-size reservation: skeleton and real badge are both absolutely
              positioned inside, so the row's footprint never changes between the
              loading and loaded states — no reflow that pushes content around. */}
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 185, height: 22 }}>
            {/* Skeleton: visible while data is loading */}
            <span style={{
              opacity: wxReady ? 0 : 1,
              transition: "opacity 0.5s ease",
              position: "absolute",
              inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}>
              <WeatherBadgeSkeleton />
            </span>
            {/* Real weather badge: fades in once ready */}
            <span style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              opacity: wxReady ? 1 : 0,
              transition: "opacity 0.6s ease 0.15s",
              whiteSpace: "nowrap",
            }}>
              {wx && <>{wmoToDesc(wx.code).emoji} {wx.temp}°F · {wmoToDesc(wx.code).label}</>}
            </span>
          </span>
        </div>
      </div>
      {/* Bezel rim — top-most overlay so the highlight/shadow edge paints above
          the photo and its gradient (both inset:0), instead of being covered by
          them. Non-interactive so it never eats the card's onClick. */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none",
        borderRadius: "var(--radius-lg, 16px)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.35)",
      }} />
    </div>
   </div>
  );
}
