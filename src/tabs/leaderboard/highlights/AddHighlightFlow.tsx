// Add-highlight flow -- two steps:
//   1) PICK: choose/take a photo or video (and, if no member identity is set,
//      who is posting).
//   2) PREVIEW EDITOR: a full-screen WYSIWYG of the final highlight. The user
//      taps the golfer (top-right) and hole (top-left); their choices render
//      as the real eyebrow + hole-meta overlays exactly as they will appear in
//      the story viewer. A bottom "Add caption" line (same size as the real
//      caption) is free-text. A green circled check (bottom-right) submits.
// Built for a 60+ audience: large tap targets, plain language, no gestures.
import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { GlassPicker } from "../../../components/common";
import { supabase } from "../../../lib/supabaseClient";
import { golferName } from "../../../lib/formatters";
import { uploadHighlightMedia, VIDEO_MAX_SECONDS } from "../../../lib/r2Upload";

// Gross score word (mirrors the viewer's eyebrow). Auto-beat copy is
// points-based; a photo of a real shot is about the gross number.
function grossLabel(gross: number, par: number): string {
  if (gross === 1) return "Ace";
  const d = gross - par;
  if (d <= -3) return "Albatross";
  if (d === -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double";
  if (d === 3) return "Triple";
  return "+" + d;
}

export function AddHighlightFlow({ event, course, courses, signups, golfers, eventEntries, holeScores, memberName, onClose, onPosted }: any) {
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
  // which bottom sheet is open in the preview editor
  const [sheet, setSheet] = useState<null | "golfer" | "hole" | "uploader">(null);
  const [captionFocused, setCaptionFocused] = useState(false);
  // video preview: start UNmuted; if the browser blocks unmuted autoplay we
  // fall back to muted and the speaker button unmutes on a real tap.
  const [videoMuted, setVideoMuted] = useState(false);
  const [kbInset, setKbInset] = useState(0); // on-screen keyboard height (visualViewport)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Subject choices: ONLY golfers who played this event.
  const subjectChoices = useMemo(() => {
    const playedIds = new Set(eventEntries.map((e: any) => e.golfer_id));
    const names = golfers
      .filter((g: any) => playedIds.has(g.golfer_id))
      .map((g: any) => golferName(golfers, g.golfer_id))
      .filter(Boolean) as string[];
    return [...new Set(names)].sort();
  }, [golfers, eventEntries]);

  // Uploader fallback (no member identity set).
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
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Keep the preview video in sync with the mute preference; if unmuted
  // autoplay is blocked, fall back to muted (the effect re-runs and plays).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return;
    v.muted = videoMuted;
    v.play().catch(() => { if (!videoMuted) setVideoMuted(true); });
  }, [videoMuted, isVideo, previewUrl]);

  // Track the on-screen keyboard height so the caption editor can sit ABOVE it
  // (visualViewport is the only reliable signal in an iOS PWA -- guessing a
  // fixed offset leaves the caption behind the keyboard).
  useEffect(() => {
    const vv: any = (window as any).visualViewport;
    if (!vv) return;
    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(captionFocused ? inset : 0);
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    onResize();
    return () => { vv.removeEventListener("resize", onResize); vv.removeEventListener("scroll", onResize); };
  }, [captionFocused]);

  const holePars: number[] = course?.hole_pars || [];

  // --- live preview overlay text (mirrors the viewer's human card) ------------
  const holeParFor = (h: number): number | null => (holePars[h - 1] != null ? holePars[h - 1] : null);

  const yardsFor = (name: string, h: number): number | null => {
    const g = (golfers || []).find((x: any) => golferName(golfers, x.golfer_id) === name);
    const su = g ? (signups || []).find((s: any) => s.event_id === event.event_id && s.golfer_id === g.golfer_id && s.tee_box_course_id != null) : null;
    const row = su ? (courses || []).find((c: any) => c.course_id === su.tee_box_course_id) : null;
    const y = Array.isArray(row?.hole_yards) ? row.hole_yards[h - 1] : Array.isArray(course?.hole_yards) ? course.hole_yards[h - 1] : null;
    return y != null && y > 0 ? y : null;
  };

  // Subject's gross result on the tagged hole -> eyebrow word.
  const subjectGrossWord = (): string | null => {
    if (typeof hole !== "number" || !subject) return null;
    const g = (golfers || []).find((x: any) => golferName(golfers, x.golfer_id) === subject);
    if (!g) return null;
    const entry = (eventEntries || []).find((e: any) => e.golfer_id === g.golfer_id);
    if (!entry) return null;
    const hs = (holeScores || []).find((h2: any) => h2.summary_id === entry.summary_id && h2.hole_number === hole);
    const par = holeParFor(hole);
    if (!hs || hs.gross_score == null || par == null) return null;
    return grossLabel(hs.gross_score, par);
  };

  const eyebrowText = (): string => {
    if (!subject) return "";
    if (hole === "pre") return `${subject} • Pre-round`;
    const gw = subjectGrossWord();
    return gw ? `${subject} • ${gw}` : subject;
  };

  const holeLabel = (): string => {
    if (hole == null) return "Add hole";
    if (hole === "pre") return "Pre-round";
    if (hole === "none") return "No hole";
    return `Hole ${hole}`;
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

  // ==== STEP 1: pick media ====================================================
  if (!previewUrl) {
    return ReactDOM.createPortal(
      <div className="hl-add-overlay">
        <div className="hl-add-head">
          <button className="hl-add-cancel" onClick={onClose}>Cancel</button>
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
            <div className="hl-add-label">Add a photo or video</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: "none" }}
              onChange={(e: any) => pickFile(e.target.files?.[0] || null)}
            />
            <button className="hl-add-bigbtn" onClick={() => fileInputRef.current?.click()}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
              Choose or take a photo / video
            </button>
            <div className="hl-add-hint">Next you'll add who it's about and which hole. Videos: {VIDEO_MAX_SECONDS} seconds max.</div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // ==== STEP 2: full-screen preview editor ====================================
  const eb = eyebrowText();
  const showHoleMeta = typeof hole === "number";
  const par = showHoleMeta ? holeParFor(hole as number) : null;
  const yds = showHoleMeta && subject ? yardsFor(subject, hole as number) : null;

  return ReactDOM.createPortal(
    <div className="hl-editor">
      {/* media: video loops WITH sound (muted state toggled by the speaker
          button); a bare autoplay may be forced muted by the browser, so the
          effect below unmutes once it can, and the button is the manual path. */}
      <div className="hl-editor-media">
        {isVideo
          ? <video ref={videoRef} key={previewUrl} src={previewUrl} muted={videoMuted} playsInline autoPlay loop preload="auto" />
          : <img src={previewUrl} alt="" />}
      </div>
      <div className="hl-editor-scrim" />

      {/* sound toggle for a video preview */}
      {isVideo && !captionFocused && (
        <button className="hl-editor-sound" onClick={() => setVideoMuted((m) => !m)} aria-label={videoMuted ? "Turn sound on" : "Turn sound off"}>
          {videoMuted
            ? <svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M22 9l-6 6M16 9l6 6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            : <svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>}
        </button>
      )}

      {/* live eyebrow (top-left, below the hole button) mirrors the viewer */}
      {eb && <div className="hl-editor-eyebrow">{eb}</div>}

      {/* live hole-meta (mirrors the viewer's .h-meta), only for a real hole */}
      {showHoleMeta && par != null && (
        <div className="hl-editor-holemeta">
          <div className="hole-meta">
            <b><i>{hole}</i></b>
            <span>Par {par}</span>
            {yds != null && <span>{yds} Yds</span>}
          </div>
        </div>
      )}

      {/* top-right controls, stacked: golfer above hole. Once a value is set
          the button collapses to just its icon to reduce clutter and read
          closer to the final result. Hidden while editing the caption so it
          doesn't collide with the Done button. */}
      <div className="hl-editor-top" style={captionFocused ? { display: "none" } : undefined}>
        <button className={"hl-editor-pick" + (subject ? " set icon" : "")} onClick={() => setSheet("golfer")} aria-label={subject ? `Golfer: ${subject}` : "Add golfer"}>
          <svg className="hl-pick-ico" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          {!subject && <span>Add golfer</span>}
        </button>
        <button className={"hl-editor-pick" + (hole != null ? " set icon" : "")} onClick={() => setSheet("hole")} aria-label={hole != null ? `Hole: ${holeLabel()}` : "Add hole"}>
          {/* filled pennant + pole; the group is nudged right so the glyph's
              visual mass sits centered in the circle */}
          <svg className="hl-pick-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><g transform="translate(2 0)"><path d="M5 21V4" /><path d="M5 4.5 15 8 5 11.5Z" fill="currentColor" stroke="none" /></g></svg>
          {hole == null && <span>Add hole</span>}
        </button>
      </div>

      {!captionFocused && (
        <button className="hl-editor-close" onClick={onClose} aria-label="Cancel">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#fff" strokeWidth="2.4" /></svg>
        </button>
      )}

      {/* while editing the caption, a dark scrim + Done button (Instagram-
          stories style); the textarea lifts to the vertical center so the
          user types in the middle of the screen instead of behind the
          keyboard. Tapping the scrim (or Done) blurs and returns it. */}
      {captionFocused && <div className="hl-editor-capscrim" onPointerDown={() => captionRef.current?.blur()} />}
      {captionFocused && (
        <button className="hl-editor-done" onPointerDown={(e) => { e.preventDefault(); captionRef.current?.blur(); }}>Done</button>
      )}

      {/* caption: sits at the bottom (real caption position). While editing it
          lifts to just ABOVE the on-screen keyboard when visualViewport can
          report the keyboard height (kbInset>0); if it can't (some PWAs don't
          resize for the keyboard), we DON'T lift it -- it stays near the
          bottom so it can't end up stranded behind the keyboard. */}
      <textarea
        ref={captionRef}
        className={"hl-editor-caption" + (captionFocused ? (kbInset > 0 ? " editing lifted" : " editing") : "")}
        style={captionFocused && kbInset > 0 ? { bottom: `calc(${kbInset}px + 18px)` } : undefined}
        value={caption}
        maxLength={90}
        rows={2}
        placeholder="Add caption"
        onFocus={() => setCaptionFocused(true)}
        onBlur={() => setCaptionFocused(false)}
        onChange={(e) => setCaption(e.target.value)}
      />

      {/* bottom: credit + submit check (hidden while editing the caption) */}
      {!captionFocused && (
        <div className="hl-editor-foot">
          <button
            className={"hl-editor-credit" + (uploader ? "" : " needs")}
            onClick={() => { if (!memberName) setSheet("uploader"); }}
            disabled={!!memberName}
          >
            {uploader ? `Added by ${uploader}` : "Tap to choose who's posting"}
          </button>
        </div>
      )}

      {/* submit: circled check in app green, enabled once golfer + poster set */}
      {!captionFocused && (
        <button className="hl-editor-submit" disabled={!canPost} onClick={post} aria-label="Post highlight">
          {posting
            ? <span className="hl-editor-spin" />
            : <svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
      )}

      {error && <div className="hl-editor-error">{error}</div>}

      {/* golfer sheet */}
      {sheet === "golfer" && (
        <div className="hl-sheet-scrim" onClick={() => setSheet(null)}>
          <div className="hl-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="hl-sheet-handle" />
            <div className="hl-sheet-title">Who is it about?</div>
            <div className="hl-sheet-list">
              {subjectChoices.map((n) => (
                <button
                  key={n}
                  className={"hl-sheet-opt" + (subject === n ? " on" : "")}
                  onClick={() => { setSubject(n); setSheet(null); }}
                >{n}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* uploader sheet (only when no member identity is set) */}
      {sheet === "uploader" && (
        <div className="hl-sheet-scrim" onClick={() => setSheet(null)}>
          <div className="hl-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="hl-sheet-handle" />
            <div className="hl-sheet-title">Who's posting?</div>
            <div className="hl-sheet-list">
              {uploaderChoices.map((n) => (
                <button
                  key={n}
                  className={"hl-sheet-opt" + (uploader === n ? " on" : "")}
                  onClick={() => { setUploader(n); setSheet(null); }}
                >{n}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* hole sheet */}
      {sheet === "hole" && (
        <div className="hl-sheet-scrim" onClick={() => setSheet(null)}>
          <div className="hl-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="hl-sheet-handle" />
            <div className="hl-sheet-title">Which hole?</div>
            <div className="hl-hole-grid">
              {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => (
                <button
                  key={h}
                  className={"hl-chip hl-chip--hole" + (hole === h ? " on" : "")}
                  onClick={() => { setHole(hole === h ? null : h); setSheet(null); }}
                >{h}</button>
              ))}
            </div>
            <div className="hl-chip-grid" style={{ marginTop: 10 }}>
              <button className={"hl-chip" + (hole === "none" ? " on" : "")} onClick={() => { setHole(hole === "none" ? null : "none"); setSheet(null); }}>No specific hole</button>
              <button className={"hl-chip" + (hole === "pre" ? " on" : "")} onClick={() => { setHole(hole === "pre" ? null : "pre"); setSheet(null); }}>Before the round</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
