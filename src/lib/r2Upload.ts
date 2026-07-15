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

async function putToR2(uploadUrl: string, blob: Blob): Promise<void> {
  const res = await fetch(uploadUrl, { method: "PUT", body: blob });
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

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image compression failed"))), "image/jpeg", quality);
  });
}

// Resize longest edge to PHOTO_MAX_EDGE at JPEG q0.8 (~5 MB phone photo -> ~300 KB).
async function compressPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await canvasToJpeg(canvas, PHOTO_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
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
