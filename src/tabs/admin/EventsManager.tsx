import { useState } from "react";
import { EventCreator } from "./EventCreator";
import { PairingDashboard } from "./PairingDashboard";
import { InkViewNav } from "./InkViewNav";

const EVENT_VIEW_TABS = [
  { id: "events", label: "EVENTS" },
  { id: "pairings", label: "PAIRINGS" },
];

// Events + Pairings consolidated behind one admin tab, split by the shared
// ink sub-view nav (same pattern as Courses > Course / Images).
export function EventsManager({ children, ...props }: any) {
  const [view, setView] = useState<"events" | "pairings">("events");
  return (
    <div>
      <InkViewNav tabs={EVENT_VIEW_TABS} view={view} setView={setView} />
      {view === "events" && (
        <>
          <EventCreator
            courses={props.courses}
            events={props.events}
            setEvents={props.setEvents}
            signups={props.signups}
            setSignups={props.setSignups}
            leaderboard={props.leaderboard}
            setLeaderboard={props.setLeaderboard}
            golfers={props.golfers}
            showSuccess={props.showSuccess}
          />
          {children}
        </>
      )}
      {view === "pairings" && (
        <PairingDashboard
          golfers={props.golfers}
          courses={props.courses}
          events={props.events}
          setEvents={props.setEvents}
          signups={props.signups}
          setSignups={props.setSignups}
          showSuccess={props.showSuccess}
          scrollToTop={props.scrollToTop}
        />
      )}
    </div>
  );
}
