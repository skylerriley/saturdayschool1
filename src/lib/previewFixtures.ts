// ============================================================
// PREVIEW MODE FIXTURES  (admin-only dummy data)
// ============================================================
// A self-contained, IN-MEMORY dataset that lets an admin see and drive the
// Live leaderboard, the Upcoming-event board, and hole-by-hole Score Entry
// WITHOUT a real event existing — so regular members never see a fake round.
//
// How it stays invisible & write-safe:
//   • These rows are merged into the arrays App.tsx passes to LeaderboardTab /
//     RSVPTab / ScoreEntryTab ONLY when (adminMode && previewMode). They never
//     enter the shared base state that gets polled or persisted, so no other
//     device ever receives them.
//   • Every preview id is NEGATIVE. That is the sentinel the App's DB-wrapped
//     setters use to route edits into the in-memory preview overlay instead of
//     Supabase — see isPreviewId() below. Real DB ids are positive; temp/local
//     ids are > 1e12; negative can never collide with either.
//   • They reuse REAL golfer ids (1–12) and a REAL course name so tee-box,
//     handicap and weather lookups resolve exactly like a real event.
//
// Two events are provided:
//   PREVIEW_EVENT_LIVE     status "In-Progress"  → lights up the Live pill.
//   PREVIEW_EVENT_UPCOMING status "Pairings Set" → lights up the Upcoming pill
//                                                   (dated today so it's inside
//                                                   the 0–2 day window).
// Both appear in the Score Entry picker (it lists Pairings Set + In-Progress).

// A field the fixtures reference. Must match a course_name in INITIAL_COURSES /
// the live courses table so tee boxes + weather resolve.
export const PREVIEW_COURSE_NAME = "Strawberry Farms GC";

// Negative-id sentinel. Any event/summary/signup/hole-score row with a negative
// id belongs to preview mode.
export function isPreviewId(id: any): boolean {
  return typeof id === "number" && id < 0;
}

// event.date "YYYY-MM-DD" for today in local time, computed lazily so the
// upcoming board always falls inside its 0–2-day visibility window regardless
// of when preview mode is switched on.
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// The 12 seed golfers, split into three tee-time groups.
const GROUP_A = [10, 5, 7, 1]; // 08:00
const GROUP_B = [3, 4, 6, 11]; // 08:10
const GROUP_C = [8, 9, 2, 12]; // 08:20

function currentSeason(): number {
  return new Date().getFullYear();
}

// ── Events ──────────────────────────────────────────────────
export function buildPreviewEvents() {
  const season = currentSeason();
  const today = todayISO();
  return [
    {
      event_id: -101,
      season,
      date: today,
      course_name: PREVIEW_COURSE_NAME,
      tee_times: ["08:00", "08:10", "08:20"],
      status: "In-Progress",
      __preview: true,
    },
    {
      event_id: -102,
      season,
      date: today,
      course_name: PREVIEW_COURSE_NAME,
      tee_times: ["08:00", "08:10", "08:20"],
      status: "Pairings Set",
      __preview: true,
    },
  ];
}

// ── Signups / pairings ──────────────────────────────────────
// tee_box_course_id points at a real course_id for the chosen tee box.
// Blue = course_id 2, White = course_id 3 (see INITIAL_COURSES).
// NOTE on signup_id: preview signup rows use a HIGH TEMP id (> 1e12). Preview
// membership is detected off the negative EVENT_id, not the signup_id. This is
// deliberate: ScoreEntryTab fires inline `supabase.update({signup_id})` calls
// guarded only by `signup_id < 1e12`, so a negative signup_id would slip through
// and hit the real DB. A > 1e12 id makes those guards skip it — no DB write.
function signupsForEvent(eventId: number, baseSignupId: number) {
  const rows: any[] = [];
  let sid = baseSignupId;
  const push = (gids: number[], tee: string, teeCourseId: number) => {
    gids.forEach((gid) => {
      rows.push({
        signup_id: sid++,
        event_id: eventId,
        golfer_id: gid,
        attending: "Yes",
        assigned_tee_time: tee,
        tee_box_course_id: teeCourseId,
        playing_handicap: null,
        is_guest_entry: false,
        sponsor_golfer_id: null,
        __preview: true,
      });
    });
  };
  push(GROUP_A, "08:00", 2);
  push(GROUP_B, "08:10", 3);
  push(GROUP_C, "08:20", 3);
  return rows;
}

export function buildPreviewSignups() {
  // High temp signup_id ranges (> 1e12), distinct per event.
  return [...signupsForEvent(-101, 9_000_000_000_001), ...signupsForEvent(-102, 9_000_000_000_101)];
}

// ── Leaderboard rows ────────────────────────────────────────
// One Hole-by-Hole entry PER GOLFER PER EVENT (both the live and the upcoming
// preview event). summary_id is NEGATIVE and derived from (event, golfer) so
// hole_scores reference it deterministically. Seeding an entry for every golfer
// is what keeps Score Entry write-free: startScoring() resumes any existing row
// whose summary_id < 1e12 (negatives qualify) instead of INSERTing a real one.
export function previewSummaryId(golferId: number, eventId: number = -101): number {
  // e.g. live golfer 7 → -2007 ; upcoming golfer 7 → -3007
  const bump = eventId === -102 ? 3000 : 2000;
  return -(bump + golferId);
}

function leaderboardForEvent(eventId: number) {
  const season = currentSeason();
  const gids = [...GROUP_A, ...GROUP_B, ...GROUP_C];
  return gids.map((gid) => ({
    summary_id: previewSummaryId(gid, eventId),
    event_id: eventId,
    golfer_id: gid,
    season,
    entry_type: "Hole-by-Hole",
    total_stableford_points: 0, // recomputed live from hole scores as they're entered
    buy_in_paid: true,
    skins_paid: true,
    charity_paid: true,
    weekly_payout_won: 0,
    skins_payout_won: 0,
    __preview: true,
  }));
}

export function buildPreviewLeaderboard() {
  return [...leaderboardForEvent(-101), ...leaderboardForEvent(-102)];
}

// ── Hole scores for the LIVE event ──────────────────────────
// Pre-fill the front nine for the 08:00 group so the Live board shows a
// realistic in-progress state (THRU 9) the moment preview mode is switched on.
// Everyone else starts blank so an admin can drive live entry from scratch.
// gross-only sample cards keyed by golfer_id; net/points are recomputed by the
// score-entry engine, but we store reasonable values so the board renders even
// before any recompute.
const FRONT_NINE_GROSS: Record<number, number[]> = {
  10: [4, 4, 3, 5, 5, 4, 3, 6, 4], // Jake (scratch-ish)
  5: [5, 4, 4, 5, 4, 5, 3, 5, 5], // Tony
  7: [4, 5, 3, 6, 4, 4, 4, 5, 4], // Skyler
  1: [5, 5, 4, 6, 5, 4, 3, 6, 5], // Mark
};

export function buildPreviewHoleScores(coursePars: number[] | null) {
  const rows: any[] = [];
  const pars = coursePars && coursePars.length === 18
    ? coursePars
    : [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 3];
  Object.entries(FRONT_NINE_GROSS).forEach(([gidStr, grosses]) => {
    const gid = Number(gidStr);
    const sid = previewSummaryId(gid);
    grosses.forEach((gross, i) => {
      const hole = i + 1;
      const par = pars[i] ?? 4;
      // Rough Stableford estimate off gross-vs-par (net ≈ gross for preview
      // display; the score-entry engine overwrites these when the admin edits).
      const rel = gross - par;
      const pts = rel <= -2 ? 4 : rel === -1 ? 3 : rel === 0 ? 2 : rel === 1 ? 1 : 0;
      rows.push({
        score_id: sid * 100 - hole, // negative, deterministic, unique
        summary_id: sid,
        hole_number: hole,
        gross_score: gross,
        net_score: gross,
        stableford_points: pts,
        __preview: true,
      });
    });
  });
  return rows;
}
