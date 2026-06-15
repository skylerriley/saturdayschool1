import { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_KEY, sendPush } from "../../lib/supabaseClient";

// ============================================================
// ── MESSAGE BLAST ─────────────────────────────────────────────
// ============================================================
export function MessageBlast({ golfers, showSuccess }: any) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState<"email" | "push" | null>(null);
  const [subCount, setSubCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=id`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Prefer": "count=exact", "Range": "0-0" }
    }).then(r => {
      const ct = r.headers.get("Content-Range");
      if (ct) { const m = ct.match(/\/(\d+)/); if (m) setSubCount(parseInt(m[1])); }
    }).catch(() => {});
  }, []);

  const activeMembers = golfers.filter((g: any) => !g.is_guest);
  const emailList = activeMembers.map((g: any) => g.email_address).filter(Boolean);

  const mailtoHref = `mailto:?cc=${emailList.join(",")}&subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

  const handlePush = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending("push");
    try {
      await sendPush(title.trim(), body.trim(), "/");
      showSuccess("Push notification sent to all subscribers!");
      setTitle(""); setBody("");
    } catch {
      alert("Failed to send push notification. Check the edge function.");
    } finally { setSending(null); }
  };

  const canSend = title.trim().length > 0 && body.trim().length > 0;

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 12 }}>Send a Message</div>
      <div className="form-group">
        <label className="form-label">Subject / Title</label>
        <input
          className="form-input"
          placeholder="e.g. Season kick-off this Saturday!"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Message</label>
        <textarea
          className="form-input"
          rows={5}
          style={{ resize: "vertical" }}
          placeholder="Write your message here…"
          value={body}
          onChange={e => setBody(e.target.value)}
        />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
        {emailList.length} member email{emailList.length !== 1 ? "s" : ""} · Push sends to {subCount === null ? "…" : subCount} subscriber{subCount !== 1 ? "s" : ""}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <a
          href={canSend ? mailtoHref : "#"}
          className="btn btn-primary"
          style={{ flex: 1, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: canSend ? 1 : 0.45, pointerEvents: canSend ? "auto" : "none" }}
          onClick={e => { if (!canSend) e.preventDefault(); }}
        >
          ✉ Send Email
        </a>
        <button
          className="btn btn-outline"
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: canSend ? 1 : 0.45 }}
          disabled={!canSend || sending === "push"}
          onClick={handlePush}
        >
          {sending === "push"
            ? <><span style={{ width: 13, height: 13, border: "2px solid var(--border)", borderTopColor: "var(--green-700)", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />Sending…</>
            : "🔔 Send Push"}
        </button>
      </div>

    </div>
  );
}
