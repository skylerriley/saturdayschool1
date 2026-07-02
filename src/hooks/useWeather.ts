import { useState, useEffect } from "react";
import { COURSE_COORDS, FALLBACK_COORDS } from "../components/weather/weatherUtils";

// useWeather: fetches forecast for a course on a date,
// returns {wx, loading} where wx has temp/code/wind/windDeg fields.
// RSVPTab renders this inline inside the existing event card.
export function useWeather(courseName: string, eventDate: string, teeTime?: string) {
  const [wx, setWx] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!eventDate || !courseName) { setWx(null); return; }
    const msPerDay = 86400000;
    const daysOut = Math.round((new Date(eventDate + "T12:00:00").getTime() - Date.now()) / msPerDay);
    if (daysOut < 0 || daysOut > 15) { setWx(null); return; }
    const coords = COURSE_COORDS[courseName] || FALLBACK_COORDS;
    // Use the actual tee time hour; fall back to 8AM
    const teeHour = teeTime ? parseInt(teeTime.slice(0, 2), 10) : 8;
    setLoading(true);
    fetch("https://api.open-meteo.com/v1/forecast"
      + "?latitude=" + coords.lat + "&longitude=" + coords.lon
      + "&hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode"
      + "&temperature_unit=fahrenheit&windspeed_unit=mph"
      + "&forecast_days=16&timezone=America%2FLos_Angeles")
      .then(r => r.json())
      .then(data => {
        const times: string[] = data.hourly.time;
        // Target the actual tee time hour; fall back to adjacent morning hours
        const teeStr = eventDate + "T" + String(teeHour).padStart(2, "0") + ":00";
        const targetIdx = times.findIndex((t: string) => t === teeStr);
        let idx = targetIdx;
        if (idx < 0) {
          const morning = times.map((t: string, i: number) => ({ t, i }))
            .filter(({ t }: any) => t.startsWith(eventDate) && parseInt(t.slice(11, 13)) >= 6 && parseInt(t.slice(11, 13)) <= 12);
          if (!morning.length) { setWx(null); setLoading(false); return; }
          idx = morning.reduce((best: any, cur: any) => {
            return Math.abs(parseInt(cur.t.slice(11, 13)) - teeHour) < Math.abs(parseInt(best.t.slice(11, 13)) - teeHour) ? cur : best;
          }).i;
        }
        const get = (k: string) => { const v = data.hourly[k]?.[idx]; return v != null ? Math.round(v) : 0; };
        setWx({ temp: get("temperature_2m"), wind: get("windspeed_10m"), windDeg: get("winddirection_10m"), code: data.hourly.weathercode[idx] });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventDate, courseName, teeTime]);
  return { wx, loading };
}
