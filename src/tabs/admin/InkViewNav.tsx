import { useState, useRef, useLayoutEffect } from "react";

// ── Admin sub-view ink nav ────────────────────────────────────────────────────
// Text-title tabs with an animated ink line underneath the active view.
// Mirrors OddsViewNav in the pre-event odds module, retuned for the light
// admin theme (earth text tones + gold ink). Shared by Events (Events/Pairings),
// Handicaps (HCP Index/Course HCPs) and Courses (Course/Images) so the three
// consolidated admin tabs read as one system.
export function InkViewNav({ tabs, view, setView }: {
  tabs: { id: string; label: string }[];
  view: string;
  setView: (v: any) => void;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [inkStyle, setInkStyle] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const idx = tabs.findIndex(t => t.id === view);
    const el = btnRefs.current[idx];
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setInkStyle({ left: elRect.left - parentRect.left, width: elRect.width });
  }, [view, tabs]);

  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", gap: 24, marginBottom: 14 }}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={el => { btnRefs.current[i] = el; }}
          onClick={() => setView(t.id)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "0 4px 12px",
            fontSize: 13, fontWeight: 700,
            color: view === t.id ? "var(--text-primary)" : "var(--text-muted)",
            WebkitTapHighlightColor: "transparent",
            transition: "color 0.2s",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {t.label}
        </button>
      ))}
      {/* Track line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: 1, background: "var(--border)",
      }} />
      {/* Ink indicator */}
      {inkStyle && (
        <div style={{
          position: "absolute", bottom: 0,
          left: inkStyle.left,
          width: inkStyle.width,
          height: 2,
          background: "var(--gold-400)",
          borderRadius: 2,
          transition: "left 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1)",
        }} />
      )}
    </div>
  );
}
