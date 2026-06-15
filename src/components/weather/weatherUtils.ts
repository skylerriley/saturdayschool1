// ============================================================
// WEATHER UTILITIES — WMO code descriptions, compass conversion,
// cloud cover text, and course coordinate lookups for Open-Meteo.
// ============================================================

export const COURSE_COORDS: Record<string, { lat: number; lon: number }> = {
  "Strawberry Farms GC": { lat: 33.6695, lon: -117.8228 },
  "Oak Creek GC": { lat: 33.6541, lon: -117.7993 },
};

// ZIP 92612 centroid
export const FALLBACK_COORDS = { lat: 33.6459, lon: -117.8428 };

export function wmoToDesc(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Clear sky", emoji: "☀️" };
  if (code <= 2) return { label: "Partly cloudy", emoji: "⛅" };
  if (code === 3) return { label: "Overcast", emoji: "☁️" };
  if (code <= 49) return { label: "Foggy", emoji: "🌫️" };
  if (code <= 59) return { label: "Drizzle", emoji: "🌦️" };
  if (code <= 69) return { label: "Rain", emoji: "🌧️" };
  if (code <= 79) return { label: "Snow", emoji: "❄️" };
  if (code <= 82) return { label: "Showers", emoji: "🌧️" };
  if (code <= 86) return { label: "Snow showers", emoji: "🌨️" };
  if (code <= 99) return { label: "Thunderstorm", emoji: "⛈️" };
  return { label: "Unknown", emoji: "🌡️" };
}

export function degToCompass(d: number): string {
  const a = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return a[Math.round(d / 22.5) % 16];
}

export function cloudText(pct: number): string {
  if (pct <= 10) return "Clear";
  if (pct <= 30) return "Mostly clear";
  if (pct <= 60) return "Partly cloudy";
  if (pct <= 85) return "Mostly cloudy";
  return "Overcast";
}
