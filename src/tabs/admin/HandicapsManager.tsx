import { useState } from "react";
import { HandicapManager } from "./HandicapManager";
import { CourseHcpSheet } from "./CourseHcpSheet";
import { InkViewNav } from "./InkViewNav";

const HCP_VIEW_TABS = [
  { id: "index", label: "HCP INDEX" },
  { id: "course", label: "COURSE HCPS" },
];

// Handicap indices + per-course playing handicaps consolidated behind one
// admin tab, split by the shared ink sub-view nav.
export function HandicapsManager({ golfers, setGolfers, courses, showSuccess }: any) {
  const [view, setView] = useState<"index" | "course">("index");
  return (
    <div>
      <InkViewNav tabs={HCP_VIEW_TABS} view={view} setView={setView} />
      {view === "index" && <HandicapManager golfers={golfers} setGolfers={setGolfers} showSuccess={showSuccess} />}
      {view === "course" && <CourseHcpSheet golfers={golfers} courses={courses} showSuccess={showSuccess} />}
    </div>
  );
}
