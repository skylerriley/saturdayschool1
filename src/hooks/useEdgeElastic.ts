import { useEffect } from "react";

export function useEdgeElastic(ref: React.RefObject<HTMLElement>, remountKey?: any) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    // navigator.platform is deprecated/empty on iOS 16+ — use userAgent instead
    const ua = navigator.userAgent || "";
    const isIOS = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (isIOS || reduce) return; // iOS has native rubber-band; reduced-motion users opted out

    let startY = 0, pull = 0, active = false, raf: number | null = null;
    // .main-content is now the scroll container -- read its own scroll
    // position rather than window.scrollY (which is always 0 since
    // .app-shell/body no longer scroll).
    const atTop = () => el.scrollTop <= 0;
    const atBottom = () => el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
    const setT = (y: number) => { el.style.transform = y ? `translateY(${y}px)` : ""; };

    const release = () => {
      active = false;
      el.style.transition = "transform 0.42s cubic-bezier(0.22,1,0.36,1)";
      setT(0);
      window.setTimeout(() => { el.style.transition = ""; }, 440);
      pull = 0;
    };
    const onStart = (e: TouchEvent) => { startY = e.touches[0].clientY; active = true; el.style.transition = ""; };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY;
      // Only handle bottom-edge elastic — top-edge pull is handled by usePullToRefresh
      const pullingUpAtBottom = dy < 0 && atBottom();
      if (pullingUpAtBottom) {
        // Damped resistance -- the further you pull, the harder it gets (mass)
        pull = Math.sign(dy) * Math.min(Math.pow(Math.abs(dy), 0.82) * 1.1, 120);
        if (e.cancelable) e.preventDefault();
        if (raf == null) raf = requestAnimationFrame(() => { raf = null; setT(pull); });
      } else if (pull !== 0) {
        pull = 0; setT(0);
      }
    };
    const onEnd = () => { if (active && pull !== 0) release(); else active = false; };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      if (raf != null) cancelAnimationFrame(raf);
    };
   
  }, [ref, remountKey]);
}
