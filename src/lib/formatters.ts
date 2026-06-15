// ============================================================
// FORMATTERS & MISC HELPERS
// Pure functions — extracted verbatim from App.tsx
// ============================================================

export function golferName(golfers: any[], id: number) {
  const g = golfers.find(x => x.golfer_id === id);
  return g ? `${g.first_name} ${g.last_name}` : "Guest";
}

// .main-content is the scroll container (see CSS) -- window/body/documentElement
// no longer scroll, so any "scroll to top after save" call needs to target it.
export function scrollMainTop() {
  (document.querySelector(".main-content") as HTMLElement | null)?.scrollTo({ top: 0, behavior: "smooth" });
}

export function formatDate(d: string) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function uniqueCourseNames(courses: any[]) {
  return [...new Set(courses.map(c => c.course_name))];
}

export function teeBoxesForCourse(courses: any[], name: string) {
  return courses.filter(c => c.course_name === name);
}
