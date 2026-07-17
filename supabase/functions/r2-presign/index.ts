// r2-presign
// Supabase Edge Function (Deno runtime)
// Mints S3-compatible SigV4 presigned PUT URLs for the Cloudflare R2 media
// bucket used by the event-highlights feature. The client uploads the blob
// straight to R2 with the returned uploadUrl and stores publicUrl in the
// highlights table. R2 credentials never leave this function.
//
// TWO request shapes:
//   1) Highlights media (original): { event_id, contentType, ext, kind:'media'|'thumb' }
//        -> key events/{event_id}/{uuid}[-thumb].{ext}
//   2) Course assets (Handoff #11): { asset:'course', course_id, hole?, view_type,
//        contentType, ext }
//        -> key courses/{course_id}/{hole|'map'}/{view_type}-{uuid}.{ext}
//      Static course imagery (artistic / hole / green layouts, and the course
//      map). hole is null for a 'course' map. A fresh uuid per call is the
//      cache-buster: replacing an image mints a NEW key, so a long
//      Cache-Control on the bucket never serves a stale layout.
// Response (both): { uploadUrl: string, publicUrl: string, key: string }
//
// Idempotency: presigning has no side effects (nothing is written until the
// client PUTs), so repeated calls are harmless by construction. Each call
// mints a fresh object key (crypto.randomUUID) so retries can never
// overwrite a previous upload.
//
// Setup + secrets: see docs/highlights-r2-setup.md. Required function secrets:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
//   R2_PUBLIC_BASE_URL (public custom domain / public bucket base, no trailing slash)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// -- CORS -------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// -- Constants ---------------------------------------------------------------
// Content types the league app is allowed to upload. Anything else is
// rejected at presign time so the bucket can only ever hold media.
const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "video/mp4": ["mp4"],
  "video/quicktime": ["mov"],
};
// Course assets are static imagery only -- no video. Client compresses to JPEG.
const COURSE_CONTENT_TYPES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
};
const COURSE_VIEW_TYPES = ["artistic", "hole", "green", "course"];
const PRESIGN_EXPIRES_SECONDS = 600; // 10 minutes to complete the PUT

// -- Env / secrets ------------------------------------------------------------
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "";
const R2_PUBLIC_BASE_URL = (Deno.env.get("R2_PUBLIC_BASE_URL") ?? "").replace(/\/+$/, "");

// -- SigV4 (Web Crypto, no dependencies) --------------------------------------
const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(data)));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

// RFC 3986 encode for query values (SigV4 requires '+' etc. escaped).
function awsEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

async function presignPut(key: string): Promise<string> {
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Path-style addressing: /{bucket}/{key}. Key segments are uuid + ext, so
  // only '/' separators need preserving.
  const canonicalUri = `/${R2_BUCKET}/` + key.split("/").map(awsEncode).join("/");

  const queryParams: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${R2_ACCESS_KEY_ID}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(PRESIGN_EXPIRES_SECONDS)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = queryParams
    .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
    .sort()
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${host}`,
    "",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  let signingKey = await hmac(encoder.encode("AWS4" + R2_SECRET_ACCESS_KEY), dateStamp);
  signingKey = await hmac(signingKey, region);
  signingKey = await hmac(signingKey, service);
  signingKey = await hmac(signingKey, "aws4_request");
  const signature = toHex(await hmac(signingKey, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// -- Entry point ---------------------------------------------------------------
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

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_BASE_URL) {
    return new Response(JSON.stringify({ error: "R2 secrets not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (_: any) {
    return new Response(JSON.stringify({ error: "JSON body required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const contentType = String(body.contentType ?? "");
  const ext = String(body.ext ?? "").toLowerCase().replace(/^\./, "");
  const jsonErr = (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

  // -- Course-asset branch (Handoff #11): static course imagery -----------------
  if (body.asset === "course") {
    const courseId = Number(body.course_id);
    const viewType = String(body.view_type ?? "");
    // hole is required for artistic/hole/green; absent for the 'course' map.
    const holeRaw = body.hole;
    const hole = holeRaw == null ? null : Number(holeRaw);

    if (!Number.isFinite(courseId) || courseId <= 0) return jsonErr("course_id must be a positive number");
    if (!COURSE_VIEW_TYPES.includes(viewType)) return jsonErr(`view_type not allowed: ${viewType}`);
    if (viewType === "course") {
      if (hole != null) return jsonErr("course-map uploads must not carry a hole");
    } else {
      if (!Number.isFinite(hole as number) || (hole as number) < 1 || (hole as number) > 18) {
        return jsonErr("hole must be 1..18 for artistic/hole/green");
      }
    }
    const courseExts = COURSE_CONTENT_TYPES[contentType];
    if (!courseExts || !courseExts.includes(ext)) return jsonErr(`contentType/ext not allowed: ${contentType} .${ext}`);

    try {
      // Fresh uuid per upload => replace-in-place mints a new key (cache-bust).
      const slot = viewType === "course" ? "map" : String(hole);
      const key = `courses/${courseId}/${slot}/${viewType}-${crypto.randomUUID()}.${ext}`;
      const uploadUrl = await presignPut(key);
      const publicUrl = `${R2_PUBLIC_BASE_URL}/${key}`;
      return new Response(JSON.stringify({ uploadUrl, publicUrl, key }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (err: any) {
      console.error("r2-presign course error:", err);
      return jsonErr(err.message, 500);
    }
  }

  // -- Highlights-media branch (original) --------------------------------------
  const eventId = Number(body.event_id);
  const kind = body.kind === "thumb" ? "thumb" : "media";

  if (!Number.isFinite(eventId) || eventId <= 0) {
    return jsonErr("event_id must be a positive number");
  }

  const allowedExts = ALLOWED_CONTENT_TYPES[contentType];
  if (!allowedExts || !allowedExts.includes(ext)) {
    return jsonErr(`contentType/ext not allowed: ${contentType} .${ext}`);
  }

  try {
    const key = `events/${eventId}/${crypto.randomUUID()}${kind === "thumb" ? "-thumb" : ""}.${ext}`;
    const uploadUrl = await presignPut(key);
    const publicUrl = `${R2_PUBLIC_BASE_URL}/${key}`;
    return new Response(JSON.stringify({ uploadUrl, publicUrl, key }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err: any) {
    console.error("r2-presign error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});
