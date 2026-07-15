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

Apply `supabase/migrations/20260713_highlights.sql` (SQL editor or
`supabase db push`). Creates `highlights`, `highlight_likes`,
`highlight_comments`, `story_beats_history` with anon RLS matching the app.

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
