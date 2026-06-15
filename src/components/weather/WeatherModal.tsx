import { useLiveWeather } from "../../hooks/useLiveWeather";
import { degToCompass } from "./weatherUtils";

// ============================================================
// WEATHER MODAL -- shown when user taps the live leaderboard header
// ============================================================
export function WeatherModal({ courseName, onClose }: { courseName: string; onClose: () => void }) {
  const { data, loading } = useLiveWeather(courseName);
  const cur = data?.current;
  const hourly: any[] = data?.hourly || [];

  // WMO code -> SVG icon -- natural intuitive colors, large & clear for older users
  // Sun: bright yellow. Cloud: medium grey. Rain: blue drops. Thunder: dark cloud + gold bolt. Snow: light blue.
  const WeatherIcon = ({ code, size = 44 }: { code: number; size?: number }) => {
    const isThunder = code >= 95;
    const isSnow = code >= 70 && code <= 79;
    const isRain = (code >= 60 && code <= 69) || (code >= 80 && code <= 82);
    const isDrizzle = code >= 50 && code <= 59;
    const isCloudy = code === 3;
    const isPartly = code === 1 || code === 2;
    const isClear = code === 0;
    const s = size;
    // Reusable cloud -- natural grey
    const Cloud = ({ ox = 0, oy = 0, fill = "#a0aab4" }: { ox?: number; oy?: number; fill?: string }) => (
      <g transform={`translate(${ox},${oy})`}>
        <ellipse cx="22" cy="31" rx="14" ry="9" fill={fill} />
        <ellipse cx="15" cy="25" rx="10" ry="9" fill={fill} />
        <ellipse cx="29" cy="24" rx="9" ry="8" fill={fill} />
      </g>
    );
    if (isClear) return (
      <svg width={s} height={s} viewBox="0 0 44 44" fill="none">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
          const r = Math.PI * deg / 180;
          return <line key={i}
            x1={22 + Math.cos(r) * 13} y1={22 + Math.sin(r) * 13}
            x2={22 + Math.cos(r) * 20} y2={22 + Math.sin(r) * 20}
            stroke="#F5C400" strokeWidth="3" strokeLinecap="round" />;
        })}
        <circle cx="22" cy="22" r="10" fill="#FFD700" />
        <circle cx="22" cy="22" r="7" fill="#FFE84D" opacity="0.7" />
      </svg>
    );
    if (isPartly) return (
      <svg width={s} height={s} viewBox="0 0 44 44" fill="none">
        {[270, 315, 0, 45, 90].map((deg, i) => {
          const r = Math.PI * deg / 180;
          return <line key={i}
            x1={13 + Math.cos(r) * 9} y1={15 + Math.sin(r) * 9}
            x2={13 + Math.cos(r) * 14} y2={15 + Math.sin(r) * 14}
            stroke="#F5C400" strokeWidth="2.5" strokeLinecap="round" />;
        })}
        <circle cx="13" cy="15" r="7" fill="#FFD700" />
        <circle cx="13" cy="15" r="5" fill="#FFE84D" opacity="0.6" />
        <Cloud ox={4} oy={2} fill="#a0aab4" />
      </svg>
    );
    if (isCloudy) return (
      <svg width={s} height={s} viewBox="0 0 44 44" fill="none">
        <Cloud fill="#a0aab4" />
      </svg>
    );
    if (isRain || isDrizzle) return (
      <svg width={s} height={s} viewBox="0 0 44 44" fill="none">
        <Cloud fill="#7f8fa6" />
        {[11, 18, 25, 32].map((x, i) => (
          <line key={i} x1={x} y1="36" x2={x - 3} y2="43"
            stroke="#4a90d9" strokeWidth="2.5" strokeLinecap="round" />
        ))}
      </svg>
    );
    if (isSnow) return (
      <svg width={s} height={s} viewBox="0 0 44 44" fill="none">
        <Cloud fill="#8fa0b0" />
        {[12, 22, 32].map((x, i) => (
          <g key={i}>
            <line x1={x} y1="36" x2={x} y2="43" stroke="#a8d4f5" strokeWidth="2" strokeLinecap="round" />
            <line x1={x - 3} y1="38.5" x2={x + 3} y2="38.5" stroke="#a8d4f5" strokeWidth="2" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    );
    if (isThunder) return (
      <svg width={s} height={s} viewBox="0 0 44 44" fill="none">
        <Cloud fill="#6b7a8d" />
        {/* Bold gold lightning bolt */}
        <polygon points="24,31 17,41 22,37 19,45 29,34 24,38" fill="#FFD700" stroke="#c47800" strokeWidth="0.5" />
      </svg>
    );
    // fog / default
    return (
      <svg width={s} height={s} viewBox="0 0 44 44" fill="none">
        <Cloud fill="#c4cdd6" />
        {[29, 33, 37].map((y, i) => (
          <rect key={i} x={7} y={y} width={30 - i * 5} height="3" rx="1.5" fill="#a0aab4" />
        ))}
      </svg>
    );
  };

  // Wind direction arrow -- thick shaft + solid arrowhead, no barbs
  const WindArrow = ({ deg, size = 16 }: { deg: number; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 20 20"
      style={{ display: "inline-block", verticalAlign: "middle", marginRight: 3, flexShrink: 0 }}>
      <g transform={`rotate(${deg + 180},10,10)`}>
        {/* Shaft */}
        <line x1="10" y1="8" x2="10" y2="18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        {/* Arrowhead */}
        <polygon points="10,1 16,9 10,6.5 4,9" fill="currentColor" />
      </g>
    </svg>
  );

  // Stat pill -- larger text for readability
  const StatPill = ({ icon, label }: { icon: string; label: string }) => (
    <div className="weather-stat">
      <span className="weather-stat-icon">{icon}</span>{label}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Scrim */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(28,20,16,0.55)", backdropFilter: "blur(2px)" }}
        onClick={onClose} />
      {/* Bottom sheet */}
      <div style={{
        position: "relative",
        background: "var(--surface)",
        borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
        border: "1px solid var(--border-md)",
        borderBottom: "none",
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 -6px 32px rgba(28,20,16,0.18)",
        fontFamily: "var(--font-sans)",
      }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 14, paddingBottom: 2 }}>
          <div style={{ width: 40, height: 5, borderRadius: 3, background: "var(--border-md)" }} />
        </div>

        {/* Header */}
        <div style={{
          background: "var(--green-900)",
          margin: "14px 16px 0",
          borderRadius: "var(--radius-md) var(--radius-md) 0 0",
          padding: "12px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textAlign: "left", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--green-300)", marginBottom: 3 }}>
              WEATHER
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "white", letterSpacing: "0.01em" }}>
              {courseName}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.08)",
            color: "var(--gold-300)", fontSize: 22, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1, fontFamily: "inherit",
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ margin: "0 16px", border: "1px solid var(--border-md)", borderTop: "none", borderRadius: "0 0 var(--radius-md) var(--radius-md)", overflow: "hidden", marginBottom: 20 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 16 }}>
              Loading weather…
            </div>
          )}
          {!loading && !cur && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 16 }}>
              Weather unavailable for this course
            </div>
          )}
          {!loading && cur && (
            <>
              {/* Current conditions */}
              <div style={{ padding: "20px 18px 16px", background: "var(--surface)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 64, textAlign: "left", fontWeight: 300, color: "var(--green-800)", lineHeight: 1, letterSpacing: "-2px", fontFamily: "var(--font-serif)" }}>
                      {cur.temp}°<span style={{ fontSize: 36, fontWeight: 400 }}>F</span>
                    </div>
                    {/* Inline subheader: wind · humidity · precip */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 0, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
                        <WindArrow deg={cur.windDeg} size={15} />{cur.wind} MPH {degToCompass(cur.windDeg)}
                      </span>
                      {cur.humidity != null && (
                        <span style={{ display: "flex", alignItems: "center", gap: 0, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
                          <svg width="12" height="14" viewBox="0 0 14 16" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 3, flexShrink: 0 }}><defs><clipPath id="dc"><path d="M7 1.5 C7 1.5 1.5 7.5 1.5 10.5 A5.5 5.5 0 0 0 12.5 10.5 C12.5 7.5 7 1.5 7 1.5Z" /></clipPath></defs><path d="M7 1.5 C7 1.5 1.5 7.5 1.5 10.5 A5.5 5.5 0 0 0 12.5 10.5 C12.5 7.5 7 1.5 7 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><rect x="0" y="10.5" width="14" height="7" fill="currentColor" clipPath="url(#dc)" /></svg>{cur.humidity}%
                        </span>
                      )}
                      {cur.precip != null && (
                        <span style={{ display: "flex", alignItems: "center", gap: 0, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 3, flexShrink: 0 }}><path d="M1 7 A6 6 0 0 1 13 7Z" fill="currentColor" /><line x1="7" y1="7" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M7 12 Q5 12 5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>{cur.precip}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <WeatherIcon code={cur.code} size={80} />
                  </div>
                </div>
              </div>

              {/* Section header */}
              <div style={{ background: "var(--green-900)", padding: "8px 18px", display: "flex", alignItems: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold-300)" }}>
                  HOURLY
                </div>
              </div>

              {/* Hourly grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", background: "var(--surface2)" }}>
                {hourly.map((h: any, i: number) => (
                  <div key={i} style={{
                    padding: "14px 4px 16px",
                    textAlign: "center",

                  }}>
                    {/* Time label */}
                    <div style={{
                      fontSize: 16, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                      color: "var(--green-800)", marginBottom: 10,
                    }}>
                      {h.label}
                    </div>
                    {/* Icon -- larger for easy recognition */}
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                      <WeatherIcon code={h.code} size={56} />
                    </div>
                    {/* Temp */}
                    <div style={{
                      fontSize: 16, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                      color: "var(--green-800)", marginBottom: 10,
                    }}>
                      {h.temp}°F
                    </div>
                    {/* Sub-stats */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 0, color: "var(--text-secondary)", fontSize: 15, fontWeight: 700 }}>
                        <WindArrow deg={h.windDeg} size={16} />{h.wind} MPH
                      </div>
                      {h.humidity != null && (
                        <div style={{ display: "flex", alignItems: "center", gap: 0, color: "var(--text-secondary)", fontSize: 14, fontWeight: 700 }}>
                          <svg width="12" height="14" viewBox="0 0 14 16" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 3, flexShrink: 0 }}><defs><clipPath id="dc2"><path d="M7 1.5 C7 1.5 1.5 7.5 1.5 10.5 A5.5 5.5 0 0 0 12.5 10.5 C12.5 7.5 7 1.5 7 1.5Z" /></clipPath></defs><path d="M7 1.5 C7 1.5 1.5 7.5 1.5 10.5 A5.5 5.5 0 0 0 12.5 10.5 C12.5 7.5 7 1.5 7 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><rect x="0" y="10.5" width="14" height="7" fill="currentColor" clipPath="url(#dc2)" /></svg>{h.humidity}%
                        </div>
                      )}
                      {h.precip != null && (
                        <div style={{ display: "flex", alignItems: "center", gap: 0, color: "var(--text-secondary)", fontSize: 14, fontWeight: 700 }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 3, flexShrink: 0 }}><path d="M1 7 A6 6 0 0 1 13 7Z" fill="currentColor" /><line x1="7" y1="7" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M7 12 Q5 12 5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>{h.precip}%
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div style={{ height: "env(safe-area-inset-bottom,10px)", minHeight: 10 }} />
      </div>
    </div>
  );
}
