import { useRef, useEffect } from "react";

export function WindParticles({ windDeg, windSpeed }: { windDeg: number | null | undefined; windSpeed?: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (windDeg == null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let w = window.innerWidth, h = window.innerHeight;
    canvas.width = w; canvas.height = h;
    const onResize = () => { w = window.innerWidth; h = window.innerHeight; canvas.width = w; canvas.height = h; };
    window.addEventListener("resize", onResize);

    // Direction the wind is blowing TOWARD, in degrees clockwise from north (top).
    const toward = (windDeg + 180) % 360;
    const rad = toward * Math.PI / 180;
    // top=north(-y), right=east(+x)
    const dirX = Math.sin(rad);
    const dirY = -Math.cos(rad);
    const speedMph = windSpeed ?? 6;
    const speed = Math.min(Math.max(speedMph * 0.18, 0.6), 4.5);

    const COUNT = 46;
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + Math.random() * 2,
      o: 0.08 + Math.random() * 0.16,
      drift: (Math.random() - 0.5) * 0.6,
    }));

    let raf = 0;
    const tick = () => {
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
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [windDeg, windSpeed]);

  if (windDeg == null) return null;
  return (
    <canvas ref={canvasRef}
      style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 0, mixBlendMode: "screen" }} />
  );
}
