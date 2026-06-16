import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import {
  Trophy,
  ClipboardList,
  Flag,
  LineChart,
  Settings,
  ShieldCheck,
} from "lucide-react";
import "./nav.css";

export interface NavTab {
  id: string;
  label: string;
}

/** Icon for each tab id. stroke-width is fixed at 2 across the set. */
const TAB_ICONS: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  leaderboard: Trophy,
  rsvp: ClipboardList,
  score: Flag,
  analytics: LineChart,
  settings: Settings,
  admin: ShieldCheck,
};

const ICON_SIZE = 22;

/**
 * The filleted "bowl" cutout, drawn in local SVG units centred at x=0 (it is
 * translated to the active tab via --cx). The flat top edge sweeps smoothly
 * down through rounded fillets — the MOUTH is the widest point — into a
 * circular bottom that follows the curvature of the active ball, leaving an
 * even ring around it. One continuous curve, no sharp corners. y runs
 * downward from the bar's top edge.
 */
const BOWL_PATH =
  "M -50 0 C -45.5 0 -31 2.4 -31 21 C -31 38.1 -20.6 52 0 52 C 20.6 52 31 38.1 31 21 C 31 2.4 45.5 0 50 0 Z";

interface BottomNavProps {
  tabs: NavTab[];
  activeTab: string;
  onSelect: (id: string) => void;
}

/**
 * Fixed bottom tab bar. The white surface + transparent filleted bowl are an
 * inline SVG (rect painted white, masked by the smooth bowl path). The bowl
 * and the floating green ball both track the active tab's centre via the --cx
 * CSS variable and slide together when the active tab changes. The cutout is
 * genuinely transparent, so page content shows through the bowl.
 */
export function BottomNav({ tabs, activeTab, onSelect }: BottomNavProps) {
  const navRef = useRef<HTMLElement>(null);
  // Measured bar size + active-tab centre (px, relative to the nav). The tabs
  // flex, so we read the live geometry rather than assuming fixed widths.
  const [geom, setGeom] = useState({ w: 0, h: 0, cx: 0, ready: false });

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const btn = nav.querySelector<HTMLElement>(".bnav__item.is-active");
      const w = nav.clientWidth;
      const h = nav.clientHeight;
      const cx = btn ? btn.offsetLeft + btn.offsetWidth / 2 : w / 2;
      setGeom((prev) =>
        prev.ready && prev.w === w && prev.h === h && prev.cx === cx
          ? prev
          : { w, h, cx, ready: true },
      );
    };
    measure();
    // Observe the BORDER-box: the nav reserves the home-indicator safe area as
    // padding, so its content-box stays constant while the border-box (and thus
    // clientHeight, which sizes the white SVG) grows/shrinks as the inset
    // changes. A default content-box observer would miss that and leave the
    // SVG — and the white surface — sized to the old, shorter height.
    const ro = new ResizeObserver(measure);
    ro.observe(nav, { box: "border-box" });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeTab, tabs.length]);

  const ActiveIcon = TAB_ICONS[activeTab] ?? Trophy;
  const navStyle = { "--cx": `${geom.cx}px` } as CSSProperties;

  return (
    <nav className="bottom-nav" aria-label="Primary" ref={navRef} style={navStyle}>
      {geom.ready && (
        <svg
          className="bnav__bg"
          width={geom.w}
          height={geom.h}
          viewBox={`0 0 ${geom.w} ${geom.h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <mask id="bnav-bowl-mask" maskUnits="userSpaceOnUse">
              {/* keep the whole bar… */}
              <rect x="0" y="0" width={geom.w} height={geom.h} fill="#fff" />
              {/* …except the bowl, which becomes transparent */}
              <path className="bnav__bowl" d={BOWL_PATH} fill="#000" />
            </mask>
            <linearGradient id="bnav-bowl-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.5" stopColor="rgba(0,0,0,0)" />
              <stop offset="1" stopColor="rgba(28,20,16,0.16)" />
            </linearGradient>
          </defs>
          <rect
            className="bnav__surface"
            x="0"
            y="0"
            width={geom.w}
            height={geom.h}
            mask="url(#bnav-bowl-mask)"
          />
          {/* subtle inner shadow hugging the bottom of the bowl */}
          <path className="bnav__bowl" d={BOWL_PATH} fill="url(#bnav-bowl-shade)" />
        </svg>
      )}

      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.id] ?? Trophy;
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            className={`bnav__item${active ? " is-active" : ""}`}
            onClick={() => onSelect(tab.id)}
            aria-current={active ? "page" : undefined}
          >
            <span className="bnav__icon">
              <Icon size={ICON_SIZE} strokeWidth={2} />
            </span>
            <span className="bnav__label">{tab.label}</span>
          </button>
        );
      })}

      {/* The floating ball — a single sliding element showing the active icon
          (1px larger than the inactive icons). */}
      <span className="bnav__ball" aria-hidden="true">
        <ActiveIcon size={ICON_SIZE + 1} strokeWidth={2} />
      </span>
    </nav>
  );
}
