import { useRef, useEffect } from "react";

// Below this wind speed the overlay isn't worth a 60fps full-viewport
// rAF loop competing with live-poll re-renders on the course.
const MIN_WIND_MPH = 3;

export function WindParticles({ windDeg, windSpeed }: { windDeg: number | null | undefined; windSpeed?: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedMph = windSpeed ?? 6;
  const calm = speedMph < MIN_WIND_MPH;

  useEffect(() => {
    if (windDeg == null || calm) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Backing store in device pixels so particles are crisp on retina;
    // drawing coordinates stay in CSS pixels via ctx.scale.
    let w = window.innerWidth, h = window.innerHeight;
    const applySize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    applySize();
    const onResize = () => applySize();
    window.addEventListener("resize", onResize);

    // Direction the wind is blowing TOWARD, in degrees clockwise from north (top).
    const toward = (windDeg + 180) % 360;
    const rad = toward * Math.PI / 180;
    // top=north(-y), right=east(+x)
    const dirX = Math.sin(rad);
    const dirY = -Math.cos(rad);
    const speed = Math.min(Math.max((windSpeed ?? 6) * 0.18, 0.6), 4.5);

    const COUNT = 46;
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + Math.random() * 2,
      o: 0.08 + Math.random() * 0.16,
      drift: (Math.random() - 0.5) * 0.6,
    }));

    let raf = 0;
    let running = true;
    const tick = () => {
      if (!running) { raf = 0; return; }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,1)";
      for (const p of particles) {
        p.x += dirX * speed + dirY * p.drift * 0.3;
        p.y += dirY * speed + dirX * p.drift * 0.3;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
        ctx.globalAlpha = p.o;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };

    // Pause the loop while the canvas is covered (modal/sheet over it) or
    // scrolled out — rAF only self-pauses when the whole tab is backgrounded.
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          const visible = entry.isIntersecting;
          if (visible && !running) { running = true; raf = requestAnimationFrame(tick); }
          else if (!visible && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
        })
      : null;
    io?.observe(canvas);

    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [windDeg, windSpeed, calm]);

  if (windDeg == null || calm) return null;
  return (
    <canvas ref={canvasRef}
      style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 0, mixBlendMode: "screen" }} />
  );
}
