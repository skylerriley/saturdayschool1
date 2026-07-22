// Add-highlight flow: pick/take a photo or video, tap the subject golfer,
// optionally tag a hole and caption, post. Built for a 60+ audience: large
// tap targets, no gestures, plain language, one scrolling page.
import { useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { GlassPicker } from "../../../components/common";
import { supabase } from "../../../lib/supabaseClient";
import { golferName } from "../../../lib/formatters";
import { uploadHighlightMedia, VIDEO_MAX_SECONDS } from "../../../lib/r2Upload";

export function AddHighlightFlow({ event, golfers, eventEntries, memberName, onClose, onPosted }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [subject, setSubject] = useState<string | null>(null);
  // hole: number = specific hole; "none" = clubhouse; "pre" = pre-round
  const [hole, setHole] = useState<number | "none" | "pre" | null>(null);
  const [caption, setCaption] = useState("");
  const [uploader, setUploader] = useState<string | null>(memberName);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Subject choices: ONLY golfers who played this event (a highlight is about
  // someone in the field).
  const subjectChoices = useMemo(() => {
    const playedIds = new Set(eventEntries.map((e: any) => e.golfer_id));
    const names = golfers
      .filter((g: any) => playedIds.has(g.golfer_id))
      .map((g: any) => golferName(golfers, g.golfer_id))
      .filter(Boolean) as string[];
    return [...new Set(names)].sort();
  }, [golfers, eventEntries]);

  // Uploader fallback (no member identity set): any active member can be the
  // one posting, playing or not.
  const uploaderChoices = useMemo(() => {
    const names = golfers
      .filter((g: any) => g.is_active !== false && !g.is_guest)
      .map((g: any) => golferName(golfers, g.golfer_id))
      .filter(Boolean) as string[];
    return [...new Set(names)].sort();
  }, [golfers]);

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setIsVideo(f.type.startsWith("video/"));
    setPreviewUrl(URL.createObjectURL(f));
  };

  const canPost = !!file && !!subject && !!uploader && !posting;

  const post = async () => {
    if (!canPost || !file) return;
    setPosting(true);
    setError(null);
    try {
      const media = await uploadHighlightMedia(event.event_id, file);
      const row = {
        event_id: event.event_id,
        golfer_name: subject,
        created_by_name: uploader,
        hole_number: typeof hole === "number" ? hole : null,
        pre_round: hole === "pre",
        media_type: media.mediaType,
        media_url: media.mediaUrl,
        thumb_url: media.thumbUrl,
        caption: caption.trim() || null,
      };
      const [inserted] = await supabase.from("highlights").insert(row);
      onPosted(inserted || { ...row, id: Date.now(), hidden: false, created_at: new Date().toISOString() });
    } catch (e: any) {
      setError(e?.message || "Something went wrong — please try again.");
      setPosting(false);
    }
  };

  const body = (
    <div className="hl-add-overlay">
      <div className="hl-add-head">
        <button className="hl-add-cancel" onClick={onClose} disabled={posting}>Cancel</button>
        <div className="hl-add-title">Add a Highlight</div>
        <div style={{ width: 64 }} />
      </div>
      <div className="hl-add-scroll">

        {memberName
          ? <div className="hl-add-postingas">Posting as <b>{memberName}</b></div>
          : (
            <div className="hl-add-section">
              <div className="hl-add-label">Who are you?</div>
              <GlassPicker<string>
                options={[{ value: "", label: "Choose your name..." }, ...uploaderChoices.map((n) => ({ value: n, label: n }))]}
                value={uploader || ""}
                onChange={(v) => setUploader(v || null)}
                style={{ width: "100%" }}
              />
            </div>
          )}

        <div className="hl-add-section">
          <div className="hl-add-label">1. The photo or video</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e: any) => pickFile(e.target.files?.[0] || null)}
          />
          {previewUrl ? (
            <div className="hl-add-preview" onClick={() => fileInputRef.current?.click()}>
              {/* Video: silent looping preview (a bare <video> paints nothing on
                  iOS until it plays). Both media kinds letterbox (contain) so the
                  full frame is visible, never top/bottom-cropped. */}
              {isVideo
                ? <video key={previewUrl} src={previewUrl} muted playsInline autoPlay loop preload="metadata" />
                : <img src={previewUrl} alt="" />}
              <div className="hl-add-preview-swap">Tap to change</div>
            </div>
          ) : (
            <button className="hl-add-bigbtn" onClick={() => fileInputRef.current?.click()}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
              Choose or take a photo / video
            </button>
          )}
          <div className="hl-add-hint">Videos: {VIDEO_MAX_SECONDS} seconds max.</div>
        </div>

        <div className="hl-add-section">
          <div className="hl-add-label">2. Who is it about?</div>
          <GlassPicker<string>
            options={[{ value: "", label: "Choose a golfer..." }, ...subjectChoices.map((n) => ({ value: n, label: n }))]}
            value={subject || ""}
            onChange={(v) => setSubject(v || null)}
            style={{ width: "100%" }}
          />
        </div>

        <div className="hl-add-section">
          <div className="hl-add-label">3. Which hole? <span className="hl-add-optional">(optional)</span></div>
          <div className="hl-hole-grid">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => (
              <button key={h} className={"hl-chip hl-chip--hole" + (hole === h ? " on" : "")} onClick={() => setHole(hole === h ? null : h)}>{h}</button>
            ))}
          </div>
          <div className="hl-chip-grid" style={{ marginTop: 8 }}>
            <button className={"hl-chip" + (hole === "none" ? " on" : "")} onClick={() => setHole(hole === "none" ? null : "none")}>No specific hole</button>
            <button className={"hl-chip" + (hole === "pre" ? " on" : "")} onClick={() => setHole(hole === "pre" ? null : "pre")}>Before the round</button>
          </div>
        </div>

        <div className="hl-add-section">
          <div className="hl-add-label">4. Caption <span className="hl-add-optional">(optional)</span></div>
          <input
            className="hl-add-caption"
            value={caption}
            maxLength={90}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Called it before it dropped."
          />
        </div>

        {error && <div className="hl-add-error">{error}</div>}

        <button className="hl-add-post" disabled={!canPost} onClick={post}>
          {posting ? "Uploading..." : "Post highlight"}
        </button>
      </div>
    </div>
  );

  return ReactDOM.createPortal(body, document.body);
}
