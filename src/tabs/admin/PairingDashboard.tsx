import { useState } from "react";
import { formatDate } from "../../lib/formatters";
import { PairingPanel } from "../../components/common/PairingPanel";

export function PairingDashboard({ golfers, courses, events, setEvents, signups, setSignups, showSuccess, showError, scrollToTop }: any) {
  const [selEventId, setSelEventId] = useState<number>(
    events.find((e: any) => e.status !== "Completed")?.event_id || 0
  );

  const selEvent = events.find((e: any) => e.event_id === selEventId);
  const eventSignups = selEvent ? signups.filter((s: any) => s.event_id === selEvent.event_id && s.attending === "Yes") : [];
  const waitingRoomCount = eventSignups.filter((s: any) => s.in_waiting_room).length;
  const inGroupsCount = eventSignups.filter((s: any) => !s.in_waiting_room).length;

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 12 }}>Pairing Engine</div>

      <div className="form-group">
        <label className="form-label">Event</label>
        <select
          className="form-select"
          value={selEventId}
          onChange={e => setSelEventId(parseInt(e.target.value))}
        >
          <option value={0}>Select event…</option>
          {events
            .filter((e: any) => e.status !== "Completed")
            .map((ev: any) => (
              <option key={ev.event_id} value={ev.event_id}>
                {formatDate(ev.date)} — {ev.course_name}
              </option>
            ))}
        </select>
      </div>

      {selEvent && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 12 }}>
          <div className="info-row">
            <span className="info-key">In groups</span>
            <span className="info-val" style={{ color: "var(--green-700)", fontWeight: 700 }}>{inGroupsCount}</span>
          </div>
          {waitingRoomCount > 0 && (
            <div className="info-row">
              <span className="info-key">Waiting room</span>
              <span className="info-val" style={{ color: "var(--gold-700)", fontWeight: 700 }}>
                {waitingRoomCount} player{waitingRoomCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <div className="info-row">
            <span className="info-key">Tee times</span>
            <span className="info-val">{selEvent.tee_times.join(" · ")}</span>
          </div>
          <div className="info-row">
            <span className="info-key">Max capacity</span>
            <span className="info-val">{selEvent.tee_times.length * 4} players ({selEvent.tee_times.length} groups × 4)</span>
          </div>
          <div className="info-row">
            <span className="info-key">Status</span>
            <span className="pill pill-gold">{selEvent.status}</span>
          </div>
        </div>
      )}

      {selEventId > 0 && (
        <PairingPanel
          golfers={golfers}
          events={events}
          setEvents={setEvents}
          signups={signups}
          setSignups={setSignups}
          selEventId={selEventId}
          adminMode={true}
          showSuccess={showSuccess}
          showError={showError}
          scrollToTop={scrollToTop}
        />
      )}
    </div>
  );
}
