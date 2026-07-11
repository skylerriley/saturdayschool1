import { useState } from "react";
import { scrollMainTop } from "../../lib/formatters";

// Frosted GlassPicker surface shared with the RSVP Add-Guest inputs, applied to
// the compact HCP number cells (which aren't .form-input, so scoped CSS misses them).
const GLASS_INPUT: React.CSSProperties = {
  width: 80, padding: "8px 10px", borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)", fontSize: 16, textAlign: "center", fontWeight: 700,
  border: "1px solid rgba(255,255,255,0.35)",
  background: "linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0.28))",
  WebkitBackdropFilter: "blur(18px) saturate(180%)", backdropFilter: "blur(18px) saturate(180%)",
  boxShadow: "0 1px 2px rgba(28,20,16,0.06),0 6px 16px rgba(28,20,16,0.08),inset 0 1px 0 rgba(255,255,255,0.6)",
};

export function HandicapManager({ golfers, setGolfers, showSuccess }: any) {
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [showInactive, setShowInactive] = useState(false);
  const handleSave = () => {
    const now = new Date().toISOString();
    setGolfers((p: any) => p.map((g: any) => {
      if (edits[g.golfer_id] === undefined) return g;
      const newHcp = parseFloat(edits[g.golfer_id]);
      if (isNaN(newHcp) || newHcp === g.current_handicap_index) return g;
      return { ...g, current_handicap_index: newHcp, handicap_updated_at: now };
    }));
    setEdits({});
    showSuccess("Handicap indices updated");
    setTimeout(() => scrollMainTop(), 50);
  };
  return (
    <div>
      <div className="card-title" style={{ marginBottom: 4 }}>Weekly Handicap Update</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>Edit handicap indices. Press Save when done.</p>
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 16 }}>
        {golfers.filter((g: any) => !g.is_guest && g.status === "Active").sort((a: any, b: any) => (a.last_name || "").localeCompare(b.last_name || "") || (a.first_name || "").localeCompare(b.first_name || "")).map((g: any, i: number, arr: any[]) => (
          <div key={g.golfer_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < arr.length - 1 ? "1.5px solid var(--border-md)" : "none", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
            <div>
              <div style={{ fontSize: 16, textAlign: "left", fontWeight: 600, color: "var(--text-primary)" }}>{g.first_name} {g.last_name}</div>
              <div style={{ fontSize: 11, textAlign: "left", color: "var(--text-muted)", marginTop: 2 }}>
                {g.handicap_updated_at ? `Updated ${new Date(g.handicap_updated_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}` : "Never updated"}
              </div>
            </div>
            <input type="number" step="0.1" min="0" max="54" style={GLASS_INPUT} value={edits[g.golfer_id] !== undefined ? edits[g.golfer_id] : g.current_handicap_index} onChange={e => setEdits(p => ({ ...p, [g.golfer_id]: e.target.value }))} />
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-full" onClick={handleSave} disabled={Object.keys(edits).length === 0}>Save Handicaps {Object.keys(edits).length > 0 ? `(${Object.keys(edits).length} changed)` : ""}</button>

      {/* Inactive & Guest golfers */}
      <div style={{ marginTop: 20, borderTop: "2px solid var(--border)", paddingTop: 16 }}>
        <button className="btn btn-outline btn-full" style={{ marginBottom: showInactive ? 12 : 0 }} onClick={() => setShowInactive(v => !v)}>
          {showInactive ? "▲ Hide" : "▼ Show"} Inactive &amp; Guest Golfers
        </button>
        {showInactive && (
          <div>
            {golfers.filter((g: any) => g.status === "Inactive" || g.is_guest).length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>No inactive or guest golfers.</div>
            ) : (
              <div style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 12 }}>
                {golfers.filter((g: any) => g.status === "Inactive" || g.is_guest).map((g: any, i: number, arr: any[]) => (
                  <div key={g.golfer_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < arr.length - 1 ? "1.5px solid var(--border-md)" : "none", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{g.first_name} {g.last_name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                        {g.is_guest ? "Guest" : g.status}
                        {g.handicap_updated_at ? ` · Updated ${new Date(g.handicap_updated_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}` : " · Never updated"}
                      </div>
                    </div>
                    <input type="number" step="0.1" min="0" max="54"
                      style={GLASS_INPUT}
                      value={edits[g.golfer_id] !== undefined ? edits[g.golfer_id] : g.current_handicap_index}
                      onChange={e => setEdits((p: any) => ({ ...p, [g.golfer_id]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-primary btn-full" onClick={handleSave} style={{ marginTop: 10 }}>Save All Changes</button>
          </div>
        )}
      </div>
    </div>
  );
}
