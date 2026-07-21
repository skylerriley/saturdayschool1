# Highlights media pipeline — Cloudflare R2 setup (operator steps)

One-time setup for the event-highlights feature. Media (photos / short videos)
uploads straight from the phone to Cloudflare R2 via presigned URLs minted by
the `r2-presign` Edge Function. The database stores only URLs.

Why R2: zero egress fees, 10 GB storage + 1M writes + 10M reads free per
month. At the league's volume (~6 GB video/year) this stays $0; egress is the
cost that would break Supabase Storage on a single busy Saturday.

## 1. Create the bucket

1. Cloudflare dashboard -> R2 -> Create bucket -> name: `saturday-school-media`.
2. Bucket settings -> CORS policy -> add:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

(Tighten `AllowedOrigins` to the deployed app origin(s) once known, e.g.
`https://saturdayschool.vercel.app` plus `http://localhost:5173` for dev.)

> **CORS gotcha (2026-07-21, cost a debugging session):** an origin is
> scheme+host+port, exactly. If the list only has `http://localhost:5173`,
> uploads fail with "presign worked but the file PUT failed" from:
> - `http://localhost:5174` (Vite silently bumps the port when 5173 is busy),
> - `http://<lan-ip>:5173` (phone testing over LAN is a DIFFERENT origin),
> - the deployed domain.
> CORS is NOT the security boundary here -- writes are gated by the 10-minute
> SigV4 presigned URL and reads are public anyway -- so `["*"]` is safe and
> avoids this whole class of failure. If you keep an explicit list, it must
> contain every origin above.

## 2. Public read access

1. Bucket -> Settings -> Public access: either connect a **custom domain**
   (recommended, e.g. `media.saturdayschool.golf`) or enable the managed
   `r2.dev` public URL.
2. Add a cache rule / default object headers so reads are edge-cached:
   `Cache-Control: public, max-age=31536000, immutable`
   (object keys are content-addressed UUIDs, so immutable is safe).
   Easiest path: Cloudflare -> Rules -> Cache Rules for the custom domain,
   or set the header at upload time later if needed.

## 3. API credentials

1. R2 -> Manage R2 API Tokens -> Create API token.
   - Permissions: **Object Read & Write**, scoped to the one bucket.
2. Note the Access Key ID, Secret Access Key, and your Account ID.

## 4. Edge Function secrets + deploy

Secrets never touch the client bundle. Set them on the Supabase project:

```sh
supabase secrets set \
  R2_ACCOUNT_ID=<account id> \
  R2_ACCESS_KEY_ID=<access key id> \
  R2_SECRET_ACCESS_KEY=<secret access key> \
  R2_BUCKET=saturday-school-media \
  R2_PUBLIC_BASE_URL=https://media.saturdayschool.golf

supabase functions deploy r2-presign
```

`R2_PUBLIC_BASE_URL` is the public read base (custom domain or
`https://pub-<hash>.r2.dev`), no trailing slash.

## 5. Database migration

Apply, in this order (SQL editor or `supabase db push`). Every file is
IDEMPOTENT — safe to re-run, and safe to run the whole sequence twice — so a
run that errors partway can just be re-applied (policies use
`drop policy if exists` then `create`; columns use `add column if not exists`):

1. `supabase/migrations/20260713_highlights.sql` — creates `highlights`,
   `highlight_likes`, `highlight_comments`, `story_beats_history` with anon RLS
   matching the app.
2. `supabase/migrations/20260715_highlights_visuals.sql` — `hole_images.view_type`
   / `anchors`; `story_beats_history.hidden` / `caption_override` + anon update.
3. `supabase/migrations/20260716_beat_hole.sql` — `story_beats_history.hole`
   (needed by the exact-identity anti-repeat cooldown).
4. `supabase/migrations/20260716_beat_history_delete.sql` — the anon DELETE
   policy + grant on `story_beats_history`. REQUIRED: the beat-history rebuild
   deletes rows per event before replaying; without this grant RLS silently
   blocks the delete and the rebuild collides on the unique constraint. (Files
   3 and 4 share the 20260716 prefix but are independent — either order works.)

## 5b. Beat history — WHEN TO REBUILD

`story_beats_history` is **sequence state**, not a cache. Each event's beats
are chosen partly by what the previous ~6 events already used (anti-repeat
cooldowns + angle decay), so event N's rows depend on N-1..N-6.

**The rebuild is the only thing that writes this table. Reads never write.**
That is a load-bearing invariant: if a read wrote, the story would depend on
who viewed what in which order — a viewer opening the newest event first finds
no rows for the preceding events, the anti-repeat never engages, and every
event composes as if it were the first ever played. (Measured on real data
before this was fixed: 6/7 events told a different story depending on viewing
order, and the `wildcard` angle fired in 7/7 events instead of 2/7.)

Run **Admin > Events > "Rebuild Beat History"** whenever:

- **any recap detector, threshold, or the composer changes** — existing rows
  were authored by the engine as it was then, and they feed the anti-repeat of
  every later event;
- scores are corrected on a past event (its beats, and every later event's
  cooldowns, may change);
- the table is ever cleared or looks wrong.

It replays every hole-by-hole event in date order, is idempotent (seeded Monte
Carlo ⇒ two runs produce identical rows), preserves admin hides/caption edits,
and clears this device's `sessionStorage` beat cache. It also runs
automatically when an event is finalized in Score Entry, so a new event's rows
exist before anyone views it. At ~25 events/year it is a few hundred ms of
client-side compute; no edge function needed.

If you change the engine and want other devices to drop cached beats
immediately, bump `BEATS_CACHE_VERSION` in `src/lib/buildBeatsInput.ts`.

## 6. Smoke test

From a browser console on the app origin:

```js
const r = await fetch("https://zxqzxlbhuepuflpatbuh.supabase.co/functions/v1/r2-presign", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer <anon key>" },
  body: JSON.stringify({ event_id: 1, contentType: "image/jpeg", ext: "jpg", kind: "media" }),
}).then((x) => x.json());
await fetch(r.uploadUrl, { method: "PUT", body: new Blob(["test"], { type: "image/jpeg" }) });
// then open r.publicUrl — should serve the object from the edge
```

## Object layout

`events/{event_id}/{uuid}.{ext}` for media, `events/{event_id}/{uuid}-thumb.jpg`
for thumbnails. Keys are minted server-side; the client never chooses paths.
