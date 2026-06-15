// ============================================================
// COURSE NAME NORMALIZATION / FUZZY MATCHING
// Used by Admin → CourseManager for GolfCourseAPI import matching.
// ============================================================

export function normCourseName(s: string): string {
  return s.toLowerCase()
    .replace(/\bgolf\s+club\b/g, "gc").replace(/\bgolf\s+course\b/g, "gc")
    .replace(/\bcountry\s+club\b/g, "cc").replace(/\bclub\b/g, "")
    .replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export function fuzzyMatchCourseName(a: string, b: string): boolean {
  const na = normCourseName(a), nb = normCourseName(b);
  if (na === nb) return true;
  // one contains the other (handles abbreviations like GC vs Golf Club)
  if (na.includes(nb) || nb.includes(na)) return true;
  // word-overlap: ≥80% of the shorter name's words present in the longer
  const wa = na.split(" "), wb = nb.split(" ");
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const matches = shorter.filter(w => w.length > 2 && longer.includes(w)).length;
  return matches / shorter.length >= 0.8;
}
