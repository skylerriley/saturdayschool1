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
