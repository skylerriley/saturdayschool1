import { useState, useRef } from "react";
import { scrollMainTop, formatDate, uniqueCourseNames } from "../../lib/formatters";

export function EventCreator({ courses, events, setEvents, signups, setSignups, golfers, showSuccess }: any) {
  const formTopRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState("");
  const [courseName, setCourseName] = useState("");
  const [teeTimes, setTeeTimes] = useState("09:10\n09:20\n09:30");
  const [season, setSeason] = useState(new Date().getFullYear());
  const [editId, setEditId] = useState<number | null>(null);
  const courseNames = uniqueCourseNames(courses);

  const resetForm = () => { setDate(""); setCourseName(""); setTeeTimes("08:00\n08:10\n08:20\n08:30"); setSeason(new Date().getFullYear()); setEditId(null); };

  const startEdit = (ev: any) => {
    setEditId(ev.event_id); setDate(ev.date); setCourseName(ev.course_name);
    setTeeTimes(ev.tee_times.join("\n")); setSeason(ev.season);
    setTimeout(() => formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSave = () => {
    if (!date || !courseName) return;
    const tts = teeTimes.split("\n").map((t: string) => t.trim()).filter(Boolean);
    if (editId !== null) {
      setEvents((p: any) => p.map((e: any) => e.event_id === editId ? { ...e, date, course_name: courseName, tee_times: tts, season } : e));
      showSuccess(`Event updated: ${formatDate(date)}`);
    } else {
      const newId = Date.now();
      setEvents((p: any) => [...p, { event_id: newId, season, date, course_name: courseName, tee_times: tts, status: "Upcoming" }]);
      const activeGs = golfers.filter((g: any) => !g.is_guest && g.status === "Active");
      setSignups((p: any) => [...p, ...activeGs.map((g: any, i: number) => ({ signup_id: Date.now() + i + 1, event_id: newId, golfer_id: g.golfer_id, attending: "Unconfirmed", assigned_tee_time: null, tee_box_course_id: null, playing_handicap: null, is_guest_entry: false, sponsor_golfer_id: null }))]);
      showSuccess(`Event created: ${formatDate(date)}`);
    }
    resetForm();
    setTimeout(() => scrollMainTop(), 50);
  };

  const deleteEvent = (evId: number, evDate: string) => {
    if (!window.confirm(`Delete event on ${formatDate(evDate)}? This cannot be undone.`)) return;
    setEvents((p: any) => p.filter((e: any) => e.event_id !== evId));
    setSignups((p: any) => p.filter((s: any) => s.event_id !== evId));
    showSuccess("Event deleted");
    setTimeout(() => scrollMainTop(), 50);
  };

  const currentYear = new Date().getFullYear();
  const allSeasonsList = [...new Set(events.map((e: any) => e.season))].sort((a: any, b: any) => b - a) as number[];
  const [filterSeason, setFilterSeason] = useState<number | "all">(allSeasonsList[0] || currentYear);
  const sortedEvents = [...events].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const allEmails = golfers.filter((g: any) => !g.is_guest && g.email_address).map((g: any) => g.email_address);
  const filteredEvents = filterSeason === "all" ? sortedEvents : sortedEvents.filter((e: any) => e.season === filterSeason);

  return (
    <div>
      <div ref={formTopRef} className="card-title" style={{ marginBottom: 12 }}>{editId ? "Edit Event" : "Create New Event"}</div>
      <div className="form-group"><label className="form-label">Season (Year)</label><input className="form-input" type="number" min="2020" max="2040" value={season} onChange={e => setSeason(parseInt(e.target.value))} /></div>
      <div className="form-group"><label className="form-label">Date</label>
        <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ cursor: "pointer" }} />
        {date && <div style={{ fontSize: 12, color: "var(--green-700)", marginTop: 4, fontWeight: 500 }}>📅 {formatDate(date)}</div>}
      </div>
      <div className="form-group"><label className="form-label">Golf Course</label><select className="form-select" value={courseName} onChange={e => setCourseName(e.target.value)}><option value="">Select course…</option>{courseNames.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Tee Times (one per line)</label><textarea className="form-input" rows={4} value={teeTimes} onChange={e => setTeeTimes(e.target.value)} style={{ resize: "vertical" }} /></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={!date || !courseName}>{editId ? "Save Changes" : "Create Event"}</button>
        {editId && <button className="btn btn-outline" onClick={resetForm}>Cancel</button>}
      </div>
      <hr className="divider" />
      <div className="card-title" style={{ marginBottom: 8 }}>Invitation Email</div>
      <a href={`mailto:?cc=${allEmails.join(",")}&subject=Saturday Golf Reminder&body=Hi all,%0D%0A%0D%0A Please make sure to sign up in the app for next Saturday's round.%0D%0A%0D%0A Sign up here: https://saturdayschool.vercel.app/?tab=rsvp`} className="btn btn-outline btn-full" style={{ textDecoration: "none", display: "flex", marginBottom: 20 }}>✉ Send Invitation</a>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="card-title">All Events</div>
        <select style={{ fontSize: 13, padding: "4px 8px", border: "1.5px solid var(--border-md)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)" }} value={filterSeason} onChange={e => setFilterSeason(e.target.value === "all" ? "all" : parseInt(e.target.value))}>
          <option value="all">All Seasons</option>
          {allSeasonsList.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {filteredEvents.map((ev: any) => (
        <div key={ev.event_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{formatDate(ev.date)}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{ev.course_name} · <span className={`pill ${ev.status === "Completed" ? "pill-green" : ev.status === "Upcoming" ? "pill-gold" : "pill-blue"}`} style={{ fontSize: 10 }}>{ev.status}</span></div>
          </div>
          {ev.season === currentYear && <button className="btn btn-sm btn-outline" onClick={() => startEdit(ev)}>Edit</button>}
          {ev.season === currentYear && ev.status !== "Completed" && <button className="btn btn-sm btn-danger" onClick={() => deleteEvent(ev.event_id, ev.date)}>Del</button>}
          {ev.season !== currentYear && <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 8px" }}>view only</span>}
        </div>
      ))}
    </div>
  );
}
