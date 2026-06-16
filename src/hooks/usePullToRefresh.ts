import { useRef, useEffect } from "react";

// Pull-to-refresh: when the page is scrolled to the very top and the user
// drags down starting from the top of the tab content, the content area
// (.main-content) is visually stretched downward to reveal a spinner above
// it. Releasing past THRESHOLD triggers onRefresh(); the content then
// bounces back up once it resolves.
//
// Touch listeners are registered on `shellRef` (the non-scrolling app
// shell) rather than the scroll container itself. On iOS PWA with
// overscroll-behavior-y:contain, touchmove events are suppressed at the
// scroll boundary when the listener is on the scroll container — attaching
// to a non-scrolling ancestor avoids that WebKit bug entirely.
//
// We still read scrollTop from `scrollRef` (the .main-content element) to
// know whether the page is at the top.
export const PULL_THRESHOLD = 70;
export const PULL_MAX = 120;

export function usePullToRefresh(
  shellRef: React.RefObject<HTMLElement>,
  scrollRef: React.RefObject<HTMLElement>,
  onRefresh: () => Promise<void>,
  setPullState: (s: { pull: number; refreshing: boolean }) => void,
  remountKey?: any
) {
  const refreshingRef = useRef(false);
  useEffect(() => {
    const shell = shellRef.current; if (!shell) return;
    if (typeof window === "undefined") return;

    let startY = 0, armed = false, pulling = false, pull = 0, raf: number | null = null;
    const atTop = () => (scrollRef.current?.scrollTop ?? 0) <= 2;

    // Walk up from the touch target to the scroll container — if any
    // ancestor in between is an independently scrollable element that isn't
    // at ITS top (e.g. a score grid or modal mid-scroll), don't arm.
    const isInsideScrolledContainer = (target: EventTarget | null): boolean => {
      const scroller = scrollRef.current;
      let node = target instanceof Element ? target : null;
      while (node && node !== scroller) {
        const style = window.getComputedStyle(node);
        const scrollable = (style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight;
        if (scrollable && node.scrollTop > 0) return true;
        node = node.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) { armed = false; pulling = false; return; }
      if (e.touches.length !== 1) { armed = false; return; }
      armed = atTop() && !isInsideScrolledContainer(e.target);
      pulling = false;
      pull = 0;
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        if (pulling) { pulling = false; pull = 0; setPullState({ pull: 0, refreshing: false }); }
        armed = false;
        return;
      }
      if (!atTop()) {
        armed = false; pulling = false; pull = 0; setPullState({ pull: 0, refreshing: false });
        return;
      }
      pulling = true;
      pull = Math.min(Math.pow(dy, 0.85), PULL_MAX);
      if (e.cancelable) e.preventDefault();
      if (raf == null) raf = requestAnimationFrame(() => { raf = null; setPullState({ pull, refreshing: false }); });
    };
    const onEnd = () => {
      armed = false;
      if (!pulling) { pull = 0; return; }
      pulling = false;
      if (pull >= PULL_THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setPullState({ pull: PULL_THRESHOLD, refreshing: true });
        onRefresh().finally(() => {
          refreshingRef.current = false;
          setPullState({ pull: 0, refreshing: false });
        });
      } else {
        setPullState({ pull: 0, refreshing: false });
      }
      pull = 0;
    };

    shell.addEventListener("touchstart", onStart, { passive: true });
    shell.addEventListener("touchmove", onMove, { passive: false });
    shell.addEventListener("touchend", onEnd, { passive: true });
    shell.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      shell.removeEventListener("touchstart", onStart);
      shell.removeEventListener("touchmove", onMove);
      shell.removeEventListener("touchend", onEnd);
      shell.removeEventListener("touchcancel", onEnd);
      if (raf != null) cancelAnimationFrame(raf);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellRef, scrollRef, remountKey]);
}
