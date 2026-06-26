import { useState, useEffect, useRef } from "react";

/**
 * Returns `ready: true` only after:
 *   (a) data is non-null, AND
 *   (b) at least `minMs` milliseconds have elapsed since the last key change
 *
 * Pass `key` to force a reset when switching contexts (e.g. event ID).
 * Without a key, switching to data that was previously seen won't retrigger
 * because the data reference may be the same cached object.
 */
export function useWeatherReady(data: any, minMs = 350, key?: any) {
  const [ready, setReady] = useState(false);
  const mountTime = useRef(Date.now());

  // Reset immediately when the key changes (new event selected)
  useEffect(() => {
    setReady(false);
    mountTime.current = Date.now();
  }, [key]);

  useEffect(() => {
    if (!data) return;
    const elapsed = Date.now() - mountTime.current;
    const remaining = Math.max(0, minMs - elapsed);
    const t = setTimeout(() => setReady(true), remaining);
    return () => clearTimeout(t);
  }, [data, minMs, key]);

  return ready;
}
