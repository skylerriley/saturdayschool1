import { useMemo } from "react";
import { formatDate } from "../../lib/formatters";
import { useWeather } from "../../hooks/useWeather";
import { wmoToDesc } from "../../components/weather/weatherUtils";
import { WeatherBadgeSkeleton } from "../../components/weather/WeatherSkeleton";
import { useWeatherReady } from "../../hooks/useWeatherReady";

// ------------------------------------------------------------------
// UPCOMING COURSE CARD -- rounded hero image (random hole photo) with
// course name, longest-tee yardage, par, and event-date weather overlay.
// ------------------------------------------------------------------
export function UpcomingCourseCard({ event, courses, holeImages, onClick, fieldCount }: any) {
  const courseName = event?.course_name || "";
  const courseImages = (holeImages || []).filter((img: any) => img.course_name === courseName && img.public_url);
  const randomImg = useMemo(() => {
    if (!courseImages.length) return null;
    return courseImages[Math.floor(Math.random() * courseImages.length)];
  }, [courseName, courseImages.length]);

  const courseTees = courses.filter((c: any) => c.course_name === courseName);
  const longestTee = courseTees.reduce((best: any, c: any) => {
    const yards = (c.hole_yards || []).reduce((a: number, b: number) => a + (b || 0), 0);
    const bestYards = (best?.hole_yards || []).reduce((a: number, b: number) => a + (b || 0), 0);
    return yards > bestYards ? c : best;
  }, courseTees[0]);
  const totalYards = (longestTee?.hole_yards || []).reduce((a: number, b: number) => a + (b || 0), 0);
  const par = longestTee?.par;

  const { wx } = useWeather(courseName, event?.date || "");
  const wxReady = useWeatherReady(wx);

  return (
    <div onClick={onClick} style={{ position: "relative", borderRadius: "var(--radius-lg, 16px)", overflow: "hidden", marginBottom: 14, minHeight: 160, background: "linear-gradient(135deg,var(--green-900),var(--green-700))", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
      {randomImg && (
        <img src={randomImg.public_url} alt={courseName}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 70%" }} />
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
          <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
            {/* Skeleton: visible while data is loading */}
            <span style={{
              opacity: wxReady ? 0 : 1,
              transition: "opacity 0.5s ease",
              position: wxReady ? "absolute" : "relative",
              inset: 0,
              pointerEvents: "none",
            }}>
              <WeatherBadgeSkeleton />
            </span>
            {/* Real weather badge: fades in once ready */}
            <span style={{
              display: "flex", alignItems: "center", gap: 4,
              opacity: wxReady ? 1 : 0,
              transition: "opacity 0.6s ease 0.15s",
            }}>
              {wx && <>{wmoToDesc(wx.code).emoji} {wx.temp}°F · {wmoToDesc(wx.code).label}</>}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
