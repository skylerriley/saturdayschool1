import { useState, useEffect } from "react";
import { COURSE_COORDS, FALLBACK_COORDS } from "../components/weather/weatherUtils";

// useWeather: fetches forecast for a course on a date,
// returns {wx, loading} where wx has temp/code/wind/windDeg fields.
// RSVPTab renders this inline inside the existing event card.
export function useWeather(courseName: string, eventDate: string) {
  const [wx, setWx] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!eventDate || !courseName) { setWx(null); return; }
    const msPerDay = 86400000;
    const daysOut = Math.round((new Date(eventDate + "T12:00:00").getTime() - Date.now()) / msPerDay);
    if (daysOut < 0 || daysOut > 15) { setWx(null); return; }
    const coords = COURSE_COORDS[courseName] || FALLBACK_COORDS;
    setLoading(true);
    fetch("https://api.open-meteo.com/v1/forecast"
      + "?latitude=" + coords.lat + "&longitude=" + coords.lon
      + "&hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode"
      + "&temperature_unit=fahrenheit&windspeed_unit=mph"
      + "&forecast_days=16&timezone=America%2FLos_Angeles")
      .then(r => r.json())
      .then(data => {
        const times: string[] = data.hourly.time;
        const idxs = times.map((t: string, i: number) => ({ t, i }))
          .filter(({ t }: any) => t.startsWith(eventDate) && parseInt(t.slice(11, 13)) >= 7 && parseInt(t.slice(11, 13)) <= 12)
          .map(({ i }: any) => i);
        if (!idxs.length) { setWx(null); setLoading(false); return; }
        const avg = (k: string) => {
          const v = idxs.map((i: number) => data.hourly[k][i]).filter((x: any) => x != null);
          return v.length ? Math.round(v.reduce((a: number, b: number) => a + b, 0) / v.length) : 0;
        };
        const codes: number[] = idxs.map((i: number) => data.hourly.weathercode[i]);
        const freq: Record<number, number> = {};
        codes.forEach((c: number) => { freq[c] = (freq[c] || 0) + 1; });
        const dominant = parseInt(Object.entries(freq).sort((a: any, b: any) => b[1] - a[1])[0][0]);
        setWx({ temp: avg("temperature_2m"), wind: avg("windspeed_10m"), windDeg: avg("winddirection_10m"), code: dominant });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventDate, courseName]);
  return { wx, loading };
}
