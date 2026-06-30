// generate-event-recap
// Supabase Edge Function (Deno runtime)
// Triggered after an event is marked Completed.
// Builds a structured JSON payload and calls Gemini 2.5 Flash to produce:
//   - ai_event_summary: 2-3 sentence event recap
//   - ai_golfer_insights: { [golfer_id]: "one sentence" }
// Both are written back to the events table row.
//
// Idempotency: skips events that already have ai_event_summary populated
// unless force=true is passed in the request body.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ── CORS ───────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ── Constants ──────────────────────────────────────────────────────────────
// Difference (in Stableford points) between this week's field avg and the
// season field avg that triggers a "tough" or "easy" scoring day flag.
const SCORING_DAY_THRESHOLD = 2.5;

// Stableford points per hole thresholds
const EAGLE_PTS = 4;
const BIRDIE_PTS = 3;

// Max notable hole entries per golfer sent to Gemini
const MAX_NOTABLE_HOLES = 2;

// ── Env / secrets ──────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_KEY = Deno.env.get("GEMINI_KEY") ?? "";
const GEMINI_MODEL = "gemini-2.5-flash";

// ── REST helpers (no Supabase JS SDK -- matches project convention) ────────
const sbHeaders = {
  "apikey": SERVICE_ROLE_KEY,
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation",
};

async function sbGet(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: sbHeaders,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET ${path} failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function sbPatch(table: string, match: Record<string, any>, body: Record<string, any>): Promise<void> {
  const q = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join("&");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${q}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PATCH ${table} failed (${res.status}): ${txt.slice(0, 200)}`);
  }
}

// ── Gemini call ────────────────────────────────────────────────────────────
async function callGemini(prompt: string, extraReminder?: string): Promise<string> {
  const fullPrompt = extraReminder ? `${prompt}\n\n${extraReminder}` : prompt;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { maxOutputTokens: 4000, temperature: 0.7 },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini API failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    console.error("Gemini returned no text. Full response:", JSON.stringify(data).slice(0, 500));
    throw new Error(`Gemini returned empty text. finishReason: ${data?.candidates?.[0]?.finishReason ?? "unknown"}`);
  }
  return text;
}

function grossLabel(holeNumber: number, grossScore: number, holePars: number[]): string {
  const par = holePars[holeNumber - 1];
  if (par == null) return `${grossScore} strokes`;
  const diff = grossScore - par;
  if (diff <= -2) return "eagle or better";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return `double bogey or worse`;
}

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  // If either brace is missing the response was truncated — return raw so the
  // caller gets a descriptive JSON.parse error rather than a silent bad slice.
  if (start === -1 || end === -1 || end <= start) return raw.trim();
  return raw.slice(start, end + 1);
}

// ── Core logic ─────────────────────────────────────────────────────────────
async function generateRecap(eventId: number, force: boolean): Promise<{ skipped?: boolean; error?: string }> {
  // 1. Fetch event row
  const events = await sbGet(`events?event_id=eq.${eventId}&select=*`);
  if (!events.length) return { error: `Event ${eventId} not found` };
  const event = events[0];

  if (event.status !== "Completed") return { error: `Event ${eventId} is not Completed (status: ${event.status})` };

  // Idempotency guard
  if (event.ai_event_summary && !force) {
    console.log(`Event ${eventId} already has ai_event_summary -- skipping (use force:true to regenerate)`);
    return { skipped: true };
  }

  // 1b. Fetch course hole pars (used to label gross scores correctly)
  let holePars: number[] = [];
  if (event.course_id) {
    const courses = await sbGet(`courses?course_id=eq.${event.course_id}&select=hole_pars`);
    holePars = courses[0]?.hole_pars ?? [];
  }
  // fallback: try matching by course name if course_id not on event
  if (!holePars.length && event.course_name) {
    const courses = await sbGet(`courses?course_name=eq.${encodeURIComponent(event.course_name)}&select=hole_pars&limit=1`);
    holePars = courses[0]?.hole_pars ?? [];
  }

  // 2. Fetch all golfers to resolve names and guest flags
  const golfers = await sbGet(`golfers?select=golfer_id,first_name,last_name,is_guest,status`);
  const golferMap: Record<number, any> = {};
  for (const g of golfers) golferMap[g.golfer_id] = g;

  // 3. Fetch leaderboard entries for this event
  const lbRows = await sbGet(
    `event_leaderboard?event_id=eq.${eventId}&select=summary_id,golfer_id,total_stableford_points,buy_in_paid,skins_paid,skins_payout_won,entry_type`
  );

  // Filter to non-guest golfers with valid golfer records
  const eligibleRows = lbRows.filter((r: any) => {
    const g = golferMap[r.golfer_id];
    return g && !g.is_guest;
  });

  if (!eligibleRows.length) return { error: `No eligible (non-guest) golfers found for event ${eventId}` };

  // 4. Fetch hole scores for this event (all summary_ids that belong to it)
  const summaryIds = lbRows.map((r: any) => r.summary_id);
  const allHoleScores = summaryIds.length
    ? await sbGet(
        `hole_scores?summary_id=in.(${summaryIds.join(",")})&select=summary_id,hole_number,gross_score,stableford_points`
      )
    : [];

  // Build summary_id -> golfer_id map
  const summaryToGolfer: Record<number, number> = {};
  for (const r of lbRows) summaryToGolfer[r.summary_id] = r.golfer_id;

  // Build per-golfer hole score arrays: { [golfer_id]: [{hole_number, gross_score, stableford_points}] }
  const golferHoleScores: Record<number, Array<{ hole_number: number; gross_score: number; stableford_points: number }>> = {};
  for (const hs of allHoleScores) {
    const gid = summaryToGolfer[hs.summary_id];
    if (gid == null) continue;
    if (!golferHoleScores[gid]) golferHoleScores[gid] = [];
    golferHoleScores[gid].push({ hole_number: hs.hole_number, gross_score: hs.gross_score, stableford_points: hs.stableford_points });
  }

  // 5. Fetch season leaderboard for averages (all completed events this season, non-guest)
  const season = event.season;
  const seasonEvents = await sbGet(`events?season=eq.${season}&status=eq.Completed&select=event_id`);
  const seasonEventIds = seasonEvents.map((e: any) => e.event_id);

  let seasonLbRows: any[] = [];
  if (seasonEventIds.length) {
    seasonLbRows = await sbGet(
      `event_leaderboard?event_id=in.(${seasonEventIds.join(",")})&select=golfer_id,total_stableford_points,event_id`
    );
    // Filter out guests
    seasonLbRows = seasonLbRows.filter((r: any) => {
      const g = golferMap[r.golfer_id];
      return g && !g.is_guest;
    });
  }

  // 6. Compute season field average (all non-guest rounds across season)
  const seasonFieldAvgPoints = seasonLbRows.length
    ? seasonLbRows.reduce((s: number, r: any) => s + (r.total_stableford_points || 0), 0) / seasonLbRows.length
    : 0;

  // 7. Compute this week's field average (eligible golfers only)
  const fieldAvgThisWeek = eligibleRows.length
    ? eligibleRows.reduce((s: number, r: any) => s + (r.total_stableford_points || 0), 0) / eligibleRows.length
    : 0;

  // 8. Scoring day flag
  const diff = fieldAvgThisWeek - seasonFieldAvgPoints;
  let scoringDayFlag: "tough" | "normal" | "easy";
  if (diff < -SCORING_DAY_THRESHOLD) {
    scoringDayFlag = "tough";
  } else if (diff > SCORING_DAY_THRESHOLD) {
    scoringDayFlag = "easy";
  } else {
    scoringDayFlag = "normal";
  }

  // 9. Per-golfer season stats
  const golferSeasonRounds: Record<number, number[]> = {};
  for (const r of seasonLbRows) {
    if (!golferSeasonRounds[r.golfer_id]) golferSeasonRounds[r.golfer_id] = [];
    golferSeasonRounds[r.golfer_id].push(r.total_stableford_points);
  }

  // Season standings (avg pts desc)
  const seasonStandings = Object.entries(golferSeasonRounds)
    .map(([gid, pts]) => ({
      golfer_id: Number(gid),
      avg: pts.reduce((a, b) => a + b, 0) / pts.length,
      rounds: pts.length,
    }))
    .sort((a, b) => b.avg - a.avg);
  const seasonRankMap: Record<number, number> = {};
  seasonStandings.forEach((row, i) => { seasonRankMap[row.golfer_id] = i + 1; });

  // 10. Determine positions for this event (sort by total_stableford_points desc)
  const sortedEligible = [...eligibleRows].sort(
    (a: any, b: any) => b.total_stableford_points - a.total_stableford_points
  );
  const eventPositionMap: Record<number, number> = {};
  for (let i = 0; i < sortedEligible.length; i++) {
    eventPositionMap[sortedEligible[i].golfer_id] = i + 1;
  }

  // 11. Skins: compute hole winners from hole_scores for skins_paid entries
  const skinsPaidEntries = eligibleRows.filter((r: any) => r.skins_paid);
  const skinsWinners: Array<{ golfer_id: number; hole: number; type: string }> = [];

  if (skinsPaidEntries.length >= 2) {
    // Build playerHoleMap: {golfer_id: {hole_number: {pts, gross}}}
    const playerHoleMap: Record<number, Record<number, { pts: number; gross: number }>> = {};
    for (const entry of skinsPaidEntries) {
      const gid = entry.golfer_id;
      const hs = golferHoleScores[gid] ?? [];
      if (!playerHoleMap[gid]) playerHoleMap[gid] = {};
      for (const h of hs) {
        if (h.stableford_points != null) {
          playerHoleMap[gid][h.hole_number] = { pts: h.stableford_points, gross: h.gross_score };
        }
      }
    }
    const pids = skinsPaidEntries.map((r: any) => r.golfer_id);
    for (let hNum = 1; hNum <= 18; hNum++) {
      const scored = pids.map((id: number) => ({ id, ...playerHoleMap[id]?.[hNum] })).filter((x) => x.pts != null);
      if (scored.length < 2) continue;
      const maxPts = Math.max(...scored.map((x) => x.pts));
      const leaders = scored.filter((x) => x.pts === maxPts);
      if (leaders.length === 1) {
        const winner = leaders[0];
        const resultType = winner.gross != null ? grossLabel(hNum, winner.gross, holePars) : (maxPts >= EAGLE_PTS ? "eagle" : maxPts >= BIRDIE_PTS ? "birdie" : "par");
        skinsWinners.push({ golfer_id: winner.id, hole: hNum, type: resultType });
      }
    }
  }

  // 12. Per-golfer recent trend (last 4 season rounds in chronological order)
  // We look at their last 4 events (excluding this one) vs season avg
  const thisEventId = event.event_id;
  const seasonEventsChronological = seasonEvents
    .filter((e: any) => e.event_id !== thisEventId)
    .sort((a: any, b: any) => a.event_id - b.event_id); // proxy for chronological (event_id ascending)

  function recentTrend(golfer_id: number, seasonAvg: number): string | null {
    const rounds = golferSeasonRounds[golfer_id] ?? [];
    if (rounds.length < 2) return null;

    // Get per-event breakdown sorted chronologically (excluding current event)
    const priorEvents = seasonEventsChronological.slice(-4);
    const priorPts = priorEvents
      .map((e: any) => seasonLbRows.find((r: any) => r.golfer_id === golfer_id && r.event_id === e.event_id))
      .filter(Boolean)
      .map((r: any) => r.total_stableford_points);

    if (priorPts.length < 2) return null;

    const lastFewAvg = priorPts.reduce((a: number, b: number) => a + b, 0) / priorPts.length;
    const aboveBelowCount = priorPts.filter((p: number) => p > seasonAvg).length;
    const belowCount = priorPts.filter((p: number) => p < seasonAvg).length;

    if (aboveBelowCount >= 3) {
      return `${aboveBelowCount} of last ${priorPts.length} rounds above season average`;
    }
    if (belowCount >= 3) {
      return `${belowCount} of last ${priorPts.length} rounds below season average`;
    }
    if (lastFewAvg - seasonAvg >= 2.5) {
      return `Trending up over last ${priorPts.length} rounds`;
    }
    if (seasonAvg - lastFewAvg >= 2.5) {
      return `Trending down over last ${priorPts.length} rounds`;
    }
    return null;
  }

  // 13. Notable holes: net eagle or better, or a 3+ net-birdie-or-better streak, capped at MAX_NOTABLE_HOLES
  // Labels use gross score so the language reads naturally (e.g. "birdie on 12" not "net eagle on 12")
  function notableHoles(golfer_id: number): Array<{ hole: number; result: string }> | null {
    const hs = (golferHoleScores[golfer_id] ?? []).sort((a, b) => a.hole_number - b.hole_number);
    if (!hs.length) return null;

    const notable: Array<{ hole: number; result: string }> = [];

    // Net eagle or better (stableford >= 4): label by gross score
    for (const h of hs) {
      if (h.stableford_points >= EAGLE_PTS) {
        const label = h.gross_score != null
          ? grossLabel(h.hole_number, h.gross_score, holePars)
          : (h.stableford_points >= 5 ? "hole-in-one/double-eagle" : "eagle");
        notable.push({ hole: h.hole_number, result: label });
      }
    }

    // 3+ consecutive net-birdie-or-better holes: label each gross result in the streak
    for (let i = 0; i < hs.length; ) {
      if (hs[i].stableford_points >= BIRDIE_PTS) {
        let j = i + 1;
        while (j < hs.length && hs[j].stableford_points >= BIRDIE_PTS) j++;
        const streak = j - i;
        if (streak >= 3) {
          const streakHoles = hs.slice(i, j);
          const labels = streakHoles.map(h =>
            h.gross_score != null ? grossLabel(h.hole_number, h.gross_score, holePars) : "birdie"
          );
          // Summarize: e.g. "3-hole streak (birdie, par, birdie) starting hole 5"
          notable.push({
            hole: hs[i].hole_number,
            result: `${streak}-hole streak (${labels.join(", ")}) starting hole ${hs[i].hole_number}`,
          });
        }
        i = j;
      } else {
        i++;
      }
    }

    if (!notable.length) return null;
    return notable.slice(0, MAX_NOTABLE_HOLES);
  }

  // 14. Build golfer payloads
  const golferPayloads = eligibleRows.map((row: any) => {
    const gid = row.golfer_id;
    const g = golferMap[gid];
    const name = g ? `${g.first_name} ${g.last_name}` : `Golfer ${gid}`;
    const seasonRounds = golferSeasonRounds[gid] ?? [];
    const seasonAvg = seasonRounds.length
      ? seasonRounds.reduce((a: number, b: number) => a + b, 0) / seasonRounds.length
      : 0;

    const lbEntry = eligibleRows.find((r: any) => r.golfer_id === gid);
    const entryType = lbEntry?.entry_type ?? "Total Only";
    const holeDataAvailable = entryType === "Hole-by-Hole" && (golferHoleScores[gid] ?? []).length > 0;

    const payload: Record<string, any> = {
      golfer_id: String(gid),
      name,
      points_this_week: row.total_stableford_points,
      position: eventPositionMap[gid] ?? 0,
      season_avg_points: Math.round(seasonAvg * 100) / 100,
      season_position: seasonRankMap[gid] ?? 0,
      hole_data_available: holeDataAvailable,
      pairing_note: null,
      recent_trend: recentTrend(gid, seasonAvg),
    };

    if (holeDataAvailable) {
      const nh = notableHoles(gid);
      payload.notable_holes = nh ?? [];
    }

    return payload;
  });

  // 15. Build final payload
  const geminiPayload = {
    event: {
      name: event.event_name || event.course_name,
      date: event.date,
      course: event.course_name,
      field_avg_points_this_week: Math.round(fieldAvgThisWeek * 100) / 100,
      season_field_avg_points: Math.round(seasonFieldAvgPoints * 100) / 100,
      scoring_day_flag: scoringDayFlag,
    },
    skins: skinsWinners.map((s) => ({
      golfer_id: String(s.golfer_id),
      hole: s.hole,
      type: s.type,
    })),
    golfers: golferPayloads,
  };

  // 16. Build prompt
  const prompt = `You are Tony, the wry analyst persona for a private weekly golf league called Saturday School. Write in a confident, slightly dry sports-column voice -- think a local beat writer, not a hype man. Never invent facts. Only use the data provided below.

Produce two things:

1. EVENT SUMMARY (2-3 sentences max):
   - Lead with the headline moment of the day (usually the winner, but a dramatic swing or collapse can lead instead if it's the better story).
   - Layer in ONE piece of historical/season context that adds weight (a streak, a standings implication, a personal pattern, a skins note) -- don't just describe the round, contextualize it.
   - If event.scoring_day_flag is "tough": explicitly attribute the tight/low scores to difficult conditions, and frame the winner as having "ground out" a win rather than describing the day as uneventful. Reward grit over flash in the language you use.
   - If event.scoring_day_flag is "easy": you may note scores ran hot across the field.
   - Do not editorialize about weather you have no data on -- only say "tough conditions" if scoring_day_flag indicates it, never guess at specific causes like wind or rain unless given that data explicitly.

2. GOLFER INSIGHTS (1 sentence max per golfer, for every golfer in the golfers array):
   - Each insight should use ONE of these angles, chosen per golfer based on what's actually most interesting in their data -- do not force an angle if the data doesn't support it:
     a) STANDINGS IMPACT -- this week's result and its effect on season standing, scoring average, skins count, or head-to-head record
     b) PERSONAL TREND -- a streak, a dip, or a return to form relative to their own season average (use recent_trend if provided)
     c) IN-ROUND TURNING POINT -- only usable if hole_data_available is true AND notable_holes is non-empty; reference a specific hole or run of holes
     d) PAIRING NOTE -- only usable if pairing_note is present
   - On a "tough" scoring day, do not frame a golfer's below-average round as a personal slump in isolation -- contextualize it against the field-wide dip.
   - Across the full set of insights for this event, vary which angle is used -- do not let more than 2-3 golfers in the same event share the same angle if better options exist for some of them.
   - It is fine, and expected, for some golfers to get a plain standings-impact insight if nothing else in their data stands out. Do not invent drama.
   - Keep each insight to one sentence. No preamble.

Return ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:
{
  "event_summary": "string",
  "golfer_insights": {
    "<golfer_id>": "string",
    ...
  }
}

Every golfer_id present in the input golfers array must have a corresponding key in the output. If you cannot find a confident angle for a golfer, return a brief neutral standings-based sentence rather than omitting them.

DATA:
${JSON.stringify(geminiPayload, null, 2)}`;

  // 17. Call Gemini with retry logic
  let rawResponse = "";
  let parsed: any = null;
  let attempts = 0;

  for (attempts = 1; attempts <= 2; attempts++) {
    try {
      const reminder = attempts > 1
        ? "IMPORTANT: Return ONLY valid JSON. No markdown fences, no commentary. Start your response with { and end with }."
        : undefined;
      rawResponse = await callGemini(prompt, reminder);
      const cleaned = extractJson(rawResponse);
      parsed = JSON.parse(cleaned);
      break;
    } catch (err: any) {
      console.error(`Gemini parse attempt ${attempts} failed:`, err.message);
      console.error(`Raw response (first 1000 chars):`, rawResponse.slice(0, 1000));
      console.error(`Extracted slice:`, extractJson(rawResponse).slice(0, 500));
      if (attempts >= 2) {
        console.error("Both Gemini attempts failed -- leaving ai_event_summary null");
        return { error: `Gemini parse failed: ${err.message} | raw[0:200]: ${rawResponse.slice(0, 200)}` };
      }
    }
  }

  if (!parsed) return { error: "No parsed response" };

  // 18. Validate response
  const eventSummary: string = parsed.event_summary ?? "";
  if (!eventSummary) {
    console.error("Gemini returned empty event_summary");
  }

  const golferInsights: Record<string, string> = parsed.golfer_insights ?? {};
  for (const row of eligibleRows) {
    const key = String(row.golfer_id);
    if (!golferInsights[key]) {
      console.warn(`Gemini missing insight for golfer_id ${key} -- storing partial result`);
    }
  }

  // 19. Write back to events table
  // Strip created_at and primary key from PATCH body per project convention
  await sbPatch("events", { event_id: eventId }, {
    ai_event_summary: eventSummary || null,
    ai_golfer_insights: Object.keys(golferInsights).length ? golferInsights : null,
  });

  console.log(`Event ${eventId} recap generated (${attempts} Gemini attempt(s)), ${Object.keys(golferInsights).length} golfer insights`);
  return {};
}

// ── Entry point ────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (_: any) {
    // empty body is fine for single-event calls if event_id is in query params
  }

  const url = new URL(req.url);
  const eventIdParam = body.event_id ?? url.searchParams.get("event_id");
  const force: boolean = body.force === true;

  if (!eventIdParam) {
    return new Response(JSON.stringify({ error: "event_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const eventId = Number(eventIdParam);
  if (!Number.isFinite(eventId)) {
    return new Response(JSON.stringify({ error: "event_id must be a number" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  try {
    const result = await generateRecap(eventId, force);
    return new Response(JSON.stringify(result.error ? { error: result.error } : { ok: true, skipped: !!result.skipped }), {
      status: result.error ? 500 : 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err: any) {
    console.error("generate-event-recap error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});
