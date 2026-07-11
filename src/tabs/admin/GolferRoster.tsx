import { useState, useRef } from "react";
import { scrollMainTop, scrollMainToEl } from "../../lib/formatters";

// -- 3a) GOLFER ROSTER ----------------------------------------
export function GolferRoster({ golfers, setGolfers, showSuccess }: any) {
  const blank = { first_name: "", last_name: "", email_address: "", current_handicap_index: "18", season_fee_paid: false };
  const [form, setForm] = useState<any>(blank);
  const [editId, setEditId] = useState<number | null>(null);
  const editFormTopRef = useRef<HTMLDivElement>(null);

  const byLastName = (a: any, b: any) => (a.last_name || "").localeCompare(b.last_name || "") || (a.first_name || "").localeCompare(b.first_name || "");
  const nonGuests = golfers.filter((g: any) => !g.is_guest);
  const activeMembers = nonGuests.filter((g: any) => g.status === "Active").sort(byLastName);
  const inactiveMembers = nonGuests.filter((g: any) => g.status !== "Active").sort(byLastName);

  const save = () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    // parseFloat(...) || 18 would coerce a legitimate 0 (scratch golfer) to 18
    const parsedHcp = parseFloat(form.current_handicap_index);
    if (editId !== null) {
      setGolfers((p: any) => p.map((g: any) => g.golfer_id === editId ? { ...g, ...form, current_handicap_index: Number.isFinite(parsedHcp) ? parsedHcp : g.current_handicap_index } : g));
      showSuccess(`${form.first_name} ${form.last_name} updated`);
    } else {
      const newId = Date.now();
      setGolfers((p: any) => [...p, { golfer_id: newId, first_name: form.first_name.trim(), last_name: form.last_name.trim(), email_address: form.email_address.trim(), current_handicap_index: Number.isFinite(parsedHcp) ? parsedHcp : 18, is_guest: false, status: "Active", season_fee_paid: form.season_fee_paid }]);
      showSuccess(`${form.first_name} ${form.last_name} added`);
    }
    setForm(blank); setEditId(null);
    setTimeout(() => scrollMainTop(), 50);
  };

  const startEdit = (g: any) => {
    setEditId(g.golfer_id);
    setForm({ first_name: g.first_name, last_name: g.last_name, email_address: g.email_address || "", current_handicap_index: String(g.current_handicap_index), season_fee_paid: !!g.season_fee_paid });
    setTimeout(() => scrollMainToEl(editFormTopRef.current), 50);
  };

  const toggleStatus = (id: number, cur: string) => {
    setGolfers((p: any) => p.map((g: any) => g.golfer_id === id ? { ...g, status: cur === "Active" ? "Inactive" : "Active" } : g));
    setTimeout(() => scrollMainTop(), 50);
  };
  const toggleFee = (id: number) => {
    setGolfers((p: any) => p.map((g: any) => g.golfer_id === id ? { ...g, season_fee_paid: !g.season_fee_paid } : g));
    showSuccess("Fee status updated");
  };

  return (
    <div>
      <div ref={editFormTopRef} className="card-title" style={{ marginBottom: 12 }}>{editId ? "Edit Golfer" : "Add New Golfer"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8, marginBottom: 8 }}>
        <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">First Name</label><input className="form-input" value={form.first_name} onChange={e => setForm((p: any) => ({ ...p, first_name: e.target.value }))} /></div>
        <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Last Name</label><input className="form-input" value={form.last_name} onChange={e => setForm((p: any) => ({ ...p, last_name: e.target.value }))} /></div>
      </div>
      <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email_address} onChange={e => setForm((p: any) => ({ ...p, email_address: e.target.value }))} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8, marginBottom: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">HCP Index</label><input className="form-input" type="number" step="0.1" min="0" max="54" value={form.current_handicap_index} onChange={e => setForm((p: any) => ({ ...p, current_handicap_index: e.target.value }))} /></div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <label className="form-label">Season Fee ($300)</label>
          <button className={`btn btn-sm${form.season_fee_paid ? " btn-primary" : " btn-outline"}`} style={{ width: "100%" }} onClick={() => setForm((p: any) => ({ ...p, season_fee_paid: !p.season_fee_paid }))}>{form.season_fee_paid ? "✓ Paid" : "Unpaid"}</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={!form.first_name.trim() || !form.last_name.trim()}>{editId ? "Save Changes" : "Add Golfer"}</button>
        {editId && <button className="btn btn-outline" onClick={() => { setEditId(null); setForm(blank); }}>Cancel</button>}
      </div>

      <div className="card-title" style={{ marginBottom: 8 }}>Members</div>
      {activeMembers.map((g: any) => (
        <div key={g.golfer_id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{g.first_name} {g.last_name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>HCP {g.current_handicap_index?.toFixed(1)} · {g.email_address || "no email"}</div>
          </div>
          <button title="Toggle $300 fee" onClick={() => toggleFee(g.golfer_id)} className={`btn btn-sm${g.season_fee_paid ? " btn-primary" : " btn-outline"}`}>{g.season_fee_paid ? "$✓" : "$?"}</button>
          <button className="btn btn-sm btn-outline" onClick={() => startEdit(g)}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => toggleStatus(g.golfer_id, g.status)}>Deactivate</button>
        </div>
      ))}
      {inactiveMembers.length > 0 && (
        <>
          <div className="card-title" style={{ marginTop: 24, marginBottom: 8 }}>Inactive</div>
          {inactiveMembers.map((g: any) => (
            <div key={g.golfer_id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{g.first_name} {g.last_name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>HCP {g.current_handicap_index?.toFixed(1)} · {g.email_address || "no email"}</div>
              </div>
              <button title="Toggle $300 fee" onClick={() => toggleFee(g.golfer_id)} className={`btn btn-sm${g.season_fee_paid ? " btn-primary" : " btn-outline"}`}>{g.season_fee_paid ? "$✓" : "$?"}</button>
              <button className="btn btn-sm btn-outline" onClick={() => startEdit(g)}>Edit</button>
              <button className="btn btn-sm btn-primary" onClick={() => toggleStatus(g.golfer_id, g.status)}>Activate</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
