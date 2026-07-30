import { useEffect, useState } from "react";

// ------------------------------------------------------------------
// Image cache — module-level memory of which image URLs have already
// been decoded this session. Even though the service worker CacheFirst-
// caches Supabase Storage images (so the bytes are local), a fresh <img>
// still has to decode and fire onLoad on every mount, which makes the
// shimmer/fade replay every time a card scrolls back into view. Tracking
// loaded URLs lets us skip the placeholder entirely on revisits.
// ------------------------------------------------------------------

const loadedUrls = new Set<string>();
// In-flight prefetch <img> refs, keyed by url, so we don't kick off
// duplicate decodes for the same photo.
const prefetching = new Map<string, HTMLImageElement>();

/** Has this URL already been decoded at least once this session? */
export function isImageLoaded(url: string | null | undefined): boolean {
  return !!url && loadedUrls.has(url);
}

/** Mark a URL as decoded (called from an <img> onLoad). */
export function markImageLoaded(url: string | null | undefined) {
  if (url) loadedUrls.add(url);
}

/**
 * Warm the cache for a batch of URLs by decoding them off-screen. Once
 * decoded they land in loadedUrls, so the next real <img> mounts already
 * "loaded" and skips the shimmer. Safe to call repeatedly — already-known
 * or in-flight URLs are skipped.
 */
export function prefetchImages(urls: (string | null | undefined)[]) {
  for (const url of urls) {
    if (!url || loadedUrls.has(url) || prefetching.has(url)) continue;
    const img = new Image();
    img.decoding = "async";
    const done = () => {
      loadedUrls.add(url);
      prefetching.delete(url);
    };
    img.onload = done;
    img.onerror = () => prefetching.delete(url);
    img.src = url;
    prefetching.set(url, img);
  }
}

/**
 * Resolve once every URL in the batch has decoded (or failed) — or when
 * `maxWaitMs` elapses, so a slow/broken image can never block a UI reveal
 * forever. null/undefined URLs count as already-satisfied. Resolves
 * immediately (synchronously-ish) when everything is already cached.
 */
export function waitForImages(
  urls: (string | null | undefined)[],
  maxWaitMs = 4000
): Promise<void> {
  const pending = urls.filter((u): u is string => !!u && !loadedUrls.has(u));
  if (pending.length === 0) return Promise.resolve();

  // Kick off decodes for anything not already in flight.
  prefetchImages(pending);

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      resolve();
    };
    // Poll the cache — prefetchImages resolves into loadedUrls; errored URLs
    // drop out of `prefetching`, so "no longer pending and no longer in flight"
    // means settled either way.
    const poll = window.setInterval(() => {
      if (pending.every((u) => loadedUrls.has(u) || !prefetching.has(u))) finish();
    }, 60);
    const timer = window.setTimeout(finish, maxWaitMs);
  });
}

/**
 * Hook for an image that fades in on first decode but appears instantly on
 * revisits. Returns whether it should be treated as already-loaded plus an
 * onLoad handler to attach to the <img>.
 */
export function useCachedImage(url: string | null | undefined) {
  const [loaded, setLoaded] = useState(() => isImageLoaded(url));

  useEffect(() => {
    setLoaded(isImageLoaded(url));
  }, [url]);

  const onLoad = () => {
    markImageLoaded(url);
    setLoaded(true);
  };

  return { loaded, onLoad };
}
