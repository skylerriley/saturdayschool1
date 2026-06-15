import { useRef, useEffect } from "react";

// Pull-to-refresh: when the page is scrolled to the very top and the user
// drags down starting from the top of the tab content, the content area
// (.main-content) is visually stretched downward to reveal a spinner above
// it. Releasing past THRESHOLD triggers onRefresh(); the content then
// bounces back up once it resolves.
//
// Critical UX requirement: normal scrolling (up AND down) inside the tab
// content must keep working everywhere else. We only "arm" the pull gesture
// if the touch STARTS while .main-content is scrolled to position 0 -- if
// the user is mid-scroll or not at the top, every touch is left completely
// alone (no preventDefault, no transform). Once armed, if the user's drag
// goes upward instead of downward we immediately disarm and let the browser
// handle it as a normal scroll.
//
// iOS notes: .main-content (not body/window) is the scroll container -- see
// CSS -- so el.scrollTop is the source of truth and iOS's native rubber-band
// bounce is contained inside .main-content, never dragging the header.
export const PULL_THRESHOLD = 70;
export const PULL_MAX = 120;

export function usePullToRefresh(
  ref: React.RefObject<HTMLElement>,
  onRefresh: () => Promise<void>,
  setPullState: (s: { pull: number; refreshing: boolean }) => void,
  remountKey?: any
) {
  const refreshingRef = useRef(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof window === "undefined") return;

    let startY = 0, armed = false, pulling = false, pull = 0, raf: number | null = null;
    const atTop = () => el.scrollTop <= 2;

    // Walk up from the touch target to `el` -- if any ancestor in between
    // is an independently scrollable element that isn't at ITS top (e.g.
    // a score grid or modal mid-scroll), don't arm: that gesture belongs
    // to the nested container, not the page-level pull-to-refresh.
    const isInsideScrolledContainer = (target: EventTarget | null): boolean => {
      let node = target instanceof Element ? target : null;
      while (node && node !== el) {
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
      // Only arm the gesture if the page is already at the very top when
      // the touch begins, AND the touch isn't starting inside a nested
      // scroll container that's itself mid-scroll. Otherwise this is a
      // normal scroll touch and we never look at it again.
      armed = atTop() && !isInsideScrolledContainer(e.target);
      pulling = false;
      pull = 0;
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        // User is scrolling/dragging up (or no movement yet) -- bail out
        // entirely so native scroll behaves normally.
        if (pulling) { pulling = false; pull = 0; setPullState({ pull: 0, refreshing: false }); }
        armed = false;
        return;
      }
      if (!atTop()) {
        // Page scrolled away from top mid-gesture (shouldn't normally
        // happen on a downward drag, but be safe) -- disarm.
        armed = false; pulling = false; pull = 0; setPullState({ pull: 0, refreshing: false });
        return;
      }
      pulling = true;
      // Damped resistance so it gets harder to pull further
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, remountKey]);
}
