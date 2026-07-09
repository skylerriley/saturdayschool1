import { useRef, useEffect, useState } from "react";
// holeImages no longer used for background — kept in props for API compatibility

const CARD_HEIGHT = 50;
const CARD_MT = 8;   // gap between header and card
const CARD_MX = 12;
const CARD_MB = 8;

function isAlertDay(): boolean {
  const day = new Date().getDay();
  return day >= 1 && day <= 3;
}

// Strip generic suffixes so "Oak Creek Golf Club" → "Oak Creek"
function shortCourseName(name: string): string {
  return name
    .replace(/\s+(Golf\s+Club|Golf\s+Course|Golf\s+Center|GC|G\.C\.)$/i, "")
    .trim();
}

interface Props {
  events: any[];
  signups: any[];
  holeImages: any[];
  /** Identified member — the reminder hides once they've answered In/Out. */
  memberGolferId?: number | null;
  mainRef: React.RefObject<HTMLElement>;
  onNavigateToSignup: () => void;
}

export function EventAlertBanner({
  events,
  signups,
  holeImages,
  memberGolferId,
  mainRef,
  onNavigateToSignup,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  // Dismissal is per-event and permanent (localStorage): dismissing this
  // week's banner keeps it hidden for that event only — next week's event
  // has a new id, so its banner shows again.
  const [dismissedEventId, setDismissedEventId] = useState<string | null>(() => {
    try { return localStorage.getItem("ss_alert_dismissed_event"); } catch { return null; }
  });
  // The swipe effect below is mounted once; it reaches the current event's
  // dismiss through this ref, assigned after upcomingEvent is derived.
  const dismissRef = useRef<() => void>(() => {});

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setScrollY(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [mainRef]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let startX = 0, startY = 0, tracking = false, currentX = 0;
    const DISMISS_PX = 80;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      currentX = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) * 1.5) { tracking = false; return; }
      if (Math.abs(dx) > 6) {
        if (e.cancelable) e.preventDefault();
        setSwiping(true);
        currentX = dx;
        setSwipeX(dx);
      }
    };
    const onEnd = () => {
      tracking = false;
      setSwiping(false);
      if (Math.abs(currentX) >= DISMISS_PX) {
        setSwipeX(currentX > 0 ? 420 : -420);
        setTimeout(() => dismissRef.current(), 220);
      } else {
        setSwipeX(0);
      }
      currentX = 0;
    };

    card.addEventListener("touchstart", onStart, { passive: true });
    card.addEventListener("touchmove", onMove, { passive: false });
    card.addEventListener("touchend", onEnd, { passive: true });
    card.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      card.removeEventListener("touchstart", onStart);
      card.removeEventListener("touchmove", onMove);
      card.removeEventListener("touchend", onEnd);
      card.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (!isAlertDay()) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingEvent = [...events]
    .filter((e: any) => {
      const d = new Date(e.date + "T00:00:00");
      return d >= today && (e.status === "Upcoming" || e.status === "Pairings Set");
    })
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  if (!upcomingEvent) return null;

  // Dismissed for this specific event -> stays hidden until a new event takes over
  if (String(upcomingEvent.event_id) === dismissedEventId) return null;
  const dismiss = () => {
    try { localStorage.setItem("ss_alert_dismissed_event", String(upcomingEvent.event_id)); } catch {}
    setDismissedEventId(String(upcomingEvent.event_id));
  };
  dismissRef.current = dismiss;

  // Identified member who has already answered (In OR Out) doesn't need the
  // reminder. Unidentified users and undecided members still see it.
  if (memberGolferId != null) {
    const mySignup = signups.find(
      (s: any) => s.event_id === upcomingEvent.event_id && s.golfer_id === memberGolferId && !s.is_guest_entry
    );
    if (mySignup && (mySignup.attending === "Yes" || mySignup.attending === "No")) return null;
  }

  const yesCount = signups.filter(
    (s: any) => s.event_id === upcomingEvent.event_id && s.attending === "Yes"
  ).length;

  const teeTimes: string[] = upcomingEvent.tee_times || [];
  const totalSpots = teeTimes.length * 4;

  const d = new Date(upcomingEvent.date + "T00:00:00");
  const mmdd = `${d.getMonth() + 1}-${d.getDate()}`;
  const courseName = shortCourseName(upcomingEvent.course_name || "");

  const totalH = CARD_MT + CARD_HEIGHT + CARD_MB;
  const slideUp = Math.min(scrollY, totalH);

  return (
    <div
      style={{
        flexShrink: 0,
        height: totalH,
        marginTop: -slideUp,
        overflow: "visible",
        pointerEvents: slideUp >= totalH ? "none" : "auto",
      }}
    >
      <div
        ref={cardRef}
        onClick={!swiping ? onNavigateToSignup : undefined}
        style={{
          position: "relative",
          height: CARD_HEIGHT,
          margin: `${CARD_MT}px ${CARD_MX}px ${CARD_MB}px`,
          borderRadius: 14,
          overflow: "hidden",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          userSelect: "none",
          // Frosted glass — blurs the green gradient behind the card
          backdropFilter: "blur(18px) saturate(1.6)",
          WebkitBackdropFilter: "blur(18px) saturate(1.6)",
          background: "rgba(255,255,255,0.10)",
          // Subtle inner border for the glass edge
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18), 0 4px 16px rgba(0,0,0,0.18)",
          transform: swipeX ? `translateX(${swipeX}px)` : "none",
          transition: swiping
            ? "none"
            : swipeX === 0
            ? "transform 0.3s cubic-bezier(0.22,1,0.36,1)"
            : "transform 0.22s ease-in",
          opacity: swiping ? Math.max(0, 1 - Math.abs(swipeX) / 220) : 1,
        }}
      >
        {/* Content — single row */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            display: "flex",
            alignItems: "center",
            padding: "0 40px 0 14px",
            gap: 10,
          }}
        >
          {/* Sign Up pill */}
          <span
            style={{
              background: "#ef4444",
              color: "#fff",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              borderRadius: 6,
              padding: "5px 10px",
              lineHeight: 1.3,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            Sign Up
          </span>

          {/* Date · Course */}
          <span
            style={{
              color: "rgba(255,255,255,0.92)",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {mmdd} · {courseName}
          </span>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Golfer count ratio */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
              {yesCount}{totalSpots > 0 ? `/${totalSpots}` : ""}
            </span>
          </div>
        </div>

        {/* Dismiss × */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          style={{
            position: "absolute",
            top: "50%",
            right: 10,
            transform: "translateY(-50%)",
            zIndex: 2,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.22)",
            color: "rgba(255,255,255,0.75)",
            fontSize: 17,
            fontWeight: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
            WebkitTapHighlightColor: "transparent",
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
