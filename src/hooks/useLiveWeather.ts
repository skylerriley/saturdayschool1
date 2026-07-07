import { useState, useEffect } from "react";
import { COURSE_COORDS, FALLBACK_COORDS } from "../components/weather/weatherUtils";

// useLiveWeather: fetches CURRENT conditions + next-N hourly slots for the live leaderboard modal.
// Uses Open-Meteo current_weather + hourly for precipitation_probability & relativehumidity_2m.
export function useLiveWeather(courseName: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    // Staleness guard: a late response for a previous course must not
    // overwrite the current course's conditions.
    let cancelled = false;
    if (!courseName) return;
    const coords = COURSE_COORDS[courseName] || FALLBACK_COORDS;
    setLoading(true);
    const base = "https://api.open-meteo.com/v1/forecast";
    const params = [
      "latitude=" + coords.lat,
      "longitude=" + coords.lon,
      "current_weather=true",
      "hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode,cloudcover,relativehumidity_2m,precipitation_probability",
      "temperature_unit=fahrenheit",
      "windspeed_unit=mph",
      "forecast_days=2",
      "timezone=auto",
    ].join("&");
    fetch(base + "?" + params)
      .then(r => r.json())
      .then(raw => {
        const cw = raw.current_weather;
        const times: string[] = raw.hourly.time;
        // Open-Meteo returns current_weather.time in the local timezone (timezone=auto).
        // Use that timestamp directly instead of toISOString() which is always UTC
        // and would match the wrong hour for users in non-UTC timezones.
        const cwLocalTime: string = cw.time; // e.g. "2026-06-06T17:00"
        const cwHourStr = cwLocalTime.slice(0, 13);  // "2026-06-06T17"
        let nowIdx = times.findIndex((t: string) => t.startsWith(cwHourStr));
        if (nowIdx < 0) nowIdx = 0;
        const get = (k: string, i: number) => raw.hourly[k]?.[i] ?? null;
        const current = {
          temp: Math.round(cw.temperature),
          wind: Math.round(cw.windspeed),
          windDeg: cw.winddirection,
          code: cw.weathercode,
          cloud: get("cloudcover", nowIdx),
          humidity: get("relativehumidity_2m", nowIdx),
          precip: get("precipitation_probability", nowIdx),
        };
        // Next 4 hourly slots (current hour + 3 more)
        const hourly = Array.from({ length: 4 }, (_, offset) => {
          const idx = nowIdx + offset;
          const timeStr = times[idx] || "";
          const hour = parseInt(timeStr.slice(11, 13));
          const ampm = hour < 12 ? "AM" : "PM";
          const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
          return {
            label: offset === 0 ? "Now" : h12 + (ampm),
            temp: Math.round(get("temperature_2m", idx) ?? cw.temperature),
            wind: Math.round(get("windspeed_10m", idx) ?? cw.windspeed),
            windDeg: get("winddirection_10m", idx) ?? cw.winddirection,
            code: get("weathercode", idx) ?? cw.weathercode,
            cloud: get("cloudcover", idx),
            humidity: get("relativehumidity_2m", idx),
            precip: get("precipitation_probability", idx),
          };
        });
        if (cancelled) return;
        setData({ current, hourly });
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseName]);
  return { data, loading };
}
