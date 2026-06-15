import { useState } from "react";
import { scrollMainTop } from "../../lib/formatters";

export function HandicapManager({ golfers, setGolfers, showSuccess }: any) {
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [showInactive, setShowInactive] = useState(false);
  const handleSave = () => { setGolfers((p: any) => p.map((g: any) => edits[g.golfer_id] !== undefined ? { ...g, current_handicap_index: parseFloat(edits[g.golfer_id]) || g.current_handicap_index } : g)); setEdits({}); showSuccess("Handicap indices updated"); setTimeout(() => scrollMainTop(), 50); };
  return (
    <div>
      <div className="card-title" style={{ marginBottom: 4 }}>Weekly Handicap Update</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>Edit handicap indices. Press Save when done.</p>
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 16 }}>
        {golfers.filter((g: any) => !g.is_guest && g.status === "Active").map((g: any, i: number, arr: any[]) => (
          <div key={g.golfer_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < arr.length - 1 ? "1.5px solid var(--border-md)" : "none", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{g.first_name} {g.last_name}</div>
            <input type="number" step="0.1" min="0" max="54" style={{ width: 80, padding: "8px 10px", border: "1.5px solid var(--border-md)", borderRadius: "var(--radius-md)", fontFamily: "var(--font-sans)", fontSize: 16, textAlign: "center", fontWeight: 700 }} value={edits[g.golfer_id] !== undefined ? edits[g.golfer_id] : g.current_handicap_index} onChange={e => setEdits(p => ({ ...p, [g.golfer_id]: e.target.value }))} />
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
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{g.is_guest ? "Guest" : g.status}</div>
                    </div>
                    <input type="number" step="0.1" min="0" max="54"
                      style={{ width: 80, padding: "8px 10px", border: "1.5px solid var(--border-md)", borderRadius: "var(--radius-md)", fontFamily: "var(--font-sans)", fontSize: 16, textAlign: "center", fontWeight: 700 }}
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
