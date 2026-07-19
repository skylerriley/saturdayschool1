// R2 media upload pipeline for event highlights.
// Flow per asset: presign (Edge Function) -> PUT blob to R2 -> keep publicUrl.
// Photos are compressed client-side via canvas (no library); videos rely on
// the phone's native capture compression and are size/duration capped here.
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseClient";

export const VIDEO_MAX_SECONDS = 20;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const PHOTO_MAX_EDGE = 1080;
const PHOTO_QUALITY = 0.8;
const THUMB_SIZE = 256;

export interface UploadedMedia {
  mediaUrl: string;
  thumbUrl: string;
  mediaType: "photo" | "video";
}

async function presign(eventId: number, contentType: string, ext: string, kind: "media" | "thumb"): Promise<{ uploadUrl: string; publicUrl: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/r2-presign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + SUPABASE_KEY,
    },
    body: JSON.stringify({ event_id: eventId, contentType, ext, kind }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.uploadUrl) throw new Error(json.error || `Presign failed (${res.status})`);
  return json;
}

// Presign a static COURSE asset (artistic / hole / green layout, or the course
// map). hole is null for a 'course' map. Distinct key namespace from highlights
// media -- see r2-presign.
async function presignCourse(courseId: number, hole: number | null, viewType: string, contentType: string, ext: string): Promise<{ uploadUrl: string; publicUrl: string }> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/r2-presign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + SUPABASE_KEY,
      },
      body: JSON.stringify({ asset: "course", course_id: courseId, hole, view_type: viewType, contentType, ext }),
    });
  } catch (_: any) {
    // A TypeError here means the request never reached the function -- the
    // r2-presign Edge Function is not deployed, or is unreachable/CORS-blocked.
    throw new Error("Could not reach the upload service (r2-presign). Is the Edge Function deployed?");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.uploadUrl) throw new Error(json.error || `Presign failed (${res.status})`);
  return json;
}

async function putToR2(uploadUrl: string, blob: Blob): Promise<void> {
  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: "PUT", body: blob });
  } catch (_: any) {
    // Presign succeeded but the PUT to R2 failed at the network layer -- almost
    // always the R2 bucket is missing a CORS policy allowing PUT from this origin.
    throw new Error("Upload to storage was blocked (R2 CORS?). The presign worked but the file PUT failed.");
  }
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

async function uploadBlob(eventId: number, blob: Blob, ext: string, kind: "media" | "thumb"): Promise<string> {
  const { uploadUrl, publicUrl } = await presign(eventId, blob.type, ext, kind);
  await putToR2(uploadUrl, blob);
  return publicUrl;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that photo"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image compression failed"))), type, quality);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return canvasToBlob(canvas, "image/jpeg", quality);
}

// Encode preserving ALPHA. JPEG has no alpha channel and fills transparency
// with black, so a PNG/WebP with a transparent background comes out opaque --
// which is why the course/hole layouts lost their transparent backgrounds.
// WebP keeps alpha and stays small; PNG is the fallback if a browser cannot
// encode WebP (older Safari). Returns the blob and the resolved type/ext so the
// presign/PUT use the RIGHT content type.
async function canvasToAlpha(canvas: HTMLCanvasElement, quality: number): Promise<{ blob: Blob; contentType: string; ext: string }> {
  const webp = await canvasToBlob(canvas, "image/webp", quality).catch(() => null);
  // Some browsers ignore an unsupported type and silently return PNG; only
  // trust it if the blob's type actually came back as webp.
  if (webp && webp.type === "image/webp") return { blob: webp, contentType: "image/webp", ext: "webp" };
  const png = await canvasToBlob(canvas, "image/png", 1);
  return { blob: png, contentType: "image/png", ext: "png" };
}

// Draw a resized copy of `file` onto a canvas (longest edge <= maxEdge) and
// hand it back for encoding. Alpha is preserved in the canvas itself.
async function drawResized(file: File, maxEdge: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    // The context starts fully transparent; drawing an image with alpha keeps it.
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Resize longest edge at JPEG quality q -- for opaque highlight PHOTOS only
// (camera photos have no transparency; JPEG is smallest).
async function compressImage(file: File, maxEdge: number, quality: number): Promise<Blob> {
  return canvasToJpeg(await drawResized(file, maxEdge), quality);
}

function compressPhoto(file: File): Promise<Blob> {
  return compressImage(file, PHOTO_MAX_EDGE, PHOTO_QUALITY);
}

// Small square center-crop thumbnail from an image element or video frame.
function makeSquareThumb(source: HTMLImageElement | HTMLVideoElement): Promise<Blob> {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  const side = Math.min(sw, sh);
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  canvas.getContext("2d")!.drawImage(source, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
  return canvasToJpeg(canvas, 0.75);
}

async function photoThumb(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return await makeSquareThumb(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Load video metadata + seek to the first frame for the thumbnail.
function loadVideoFrame(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that video"));
    };
    video.onerror = fail;
    video.onloadedmetadata = () => {
      // Seek slightly in so we do not grab a black leading frame.
      video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    };
    video.onseeked = () => resolve(video);
    video.src = url;
  });
}

export function validateVideo(file: File, durationSeconds: number): string | null {
  if (durationSeconds > VIDEO_MAX_SECONDS + 0.5) {
    return `Videos must be ${VIDEO_MAX_SECONDS} seconds or less (this one is ${Math.round(durationSeconds)}s). Trim it in your Photos app first.`;
  }
  if (file.size > VIDEO_MAX_BYTES) {
    return "That video file is too large (max 50 MB). Trim it shorter and try again.";
  }
  return null;
}

function extFor(file: File): { contentType: string; ext: string } | null {
  const t = file.type;
  if (t === "image/jpeg") return { contentType: t, ext: "jpg" };
  if (t === "image/webp") return { contentType: t, ext: "webp" };
  if (t === "image/png" || t === "image/heic" || t === "image/heif" || t.startsWith("image/")) {
    // Anything image-ish goes through canvas compression and comes out JPEG.
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (t === "video/mp4") return { contentType: t, ext: "mp4" };
  if (t === "video/quicktime") return { contentType: t, ext: "mov" };
  return null;
}

// Full pipeline for one picked file. Throws with a user-readable message.
export async function uploadHighlightMedia(eventId: number, file: File): Promise<UploadedMedia> {
  const kind = extFor(file);
  if (!kind) throw new Error("That file type is not supported — use a photo or a phone video.");

  if (kind.contentType.startsWith("video/")) {
    const frame = await loadVideoFrame(file);
    const err = validateVideo(file, frame.duration || 0);
    if (err) {
      URL.revokeObjectURL(frame.src);
      throw new Error(err);
    }
    const thumbBlob = await makeSquareThumb(frame);
    URL.revokeObjectURL(frame.src);
    const [mediaUrl, thumbUrl] = await Promise.all([
      uploadBlob(eventId, file, kind.ext, "media"),
      uploadBlob(eventId, thumbBlob, "jpg", "thumb"),
    ]);
    return { mediaUrl, thumbUrl, mediaType: "video" };
  }

  const [compressed, thumbBlob] = await Promise.all([compressPhoto(file), photoThumb(file)]);
  const [mediaUrl, thumbUrl] = await Promise.all([
    uploadBlob(eventId, compressed, "jpg", "media"),
    uploadBlob(eventId, thumbBlob, "jpg", "thumb"),
  ]);
  return { mediaUrl, thumbUrl, mediaType: "photo" };
}

// ---------------------------------------------------------------------------
// Course assets (Handoff #11): artistic / hole / green layouts + the course map.
// These are uploaded once per hole from a phone and READ REPEATEDLY (every
// highlight beat pulls the artistic background), so they can be larger than a
// highlight photo -- 1600px longest edge at q0.85. Encoded as WebP so the
// TRANSPARENT BACKGROUND is preserved (JPEG has no alpha and would fill it with
// black); PNG fallback if the browser cannot encode WebP. hole is null for a
// 'course' map. Returns the R2 publicUrl to store on the hole_images row.
const COURSE_MAX_EDGE = 1600;
const COURSE_QUALITY = 0.85;

export type CourseViewType = "artistic" | "hole" | "green" | "course";

// Does the drawn canvas contain any transparent pixel? Sampling a coarse grid
// (not every pixel) is enough to tell a cutout with a transparent background
// from an opaque photo, and stays cheap on a large image.
function canvasHasAlpha(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext("2d")!;
    const { width: w, height: h } = canvas;
    const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
    // Corners are the most likely transparent region for a centered cutout;
    // scan a grid to catch interior holes too.
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (ctx.getImageData(x, y, 1, 1).data[3] < 250) return true;
      }
    }
  } catch (_: any) { /* tainted canvas etc. -- treat as opaque */ }
  return false;
}

export interface UploadedCourseAsset { publicUrl: string; hasAlpha: boolean; }

export async function uploadCourseAsset(courseId: number, hole: number | null, viewType: CourseViewType, file: File): Promise<UploadedCourseAsset> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file type is not supported -- use a photo.");
  }
  const canvas = await drawResized(file, COURSE_MAX_EDGE);
  const hasAlpha = canvasHasAlpha(canvas);
  const { blob, contentType, ext } = await canvasToAlpha(canvas, COURSE_QUALITY);
  const { uploadUrl, publicUrl } = await presignCourse(courseId, hole, viewType, contentType, ext);
  await putToR2(uploadUrl, blob);
  return { publicUrl, hasAlpha };
}
