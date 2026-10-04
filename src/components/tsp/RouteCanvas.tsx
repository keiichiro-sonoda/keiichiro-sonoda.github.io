// 都市と、これまでの最短の巡回路を描く。最短が縮んだ瞬間に、経路を一瞬光らせる
import { useEffect, useRef, type RefObject } from "react";
import type { Point } from "./engine/points";

interface Props {
  points: Point[];
  route: RefObject<number[] | null>;
  /** 経路が変わるたびに増える番号（ref の中身の変化を描き直しのきっかけにする） */
  routeVersion: number;
}

const PAD = 14;

export default function RouteCanvas({ points, route, routeVersion }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const flash = useRef(0); // 1 → 0 に減っていく光り方
  const lastVersion = useRef(routeVersion);
  const raf = useRef(0);
  const drawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const draw = () => {
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const size = el.clientWidth;
      if (el.width !== Math.round(size * dpr)) {
        el.width = Math.round(size * dpr);
        el.height = Math.round(size * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(el);
      const color = (name: string) => css.getPropertyValue(name).trim();
      const span = size - PAD * 2;
      const px = (p: Point) => [PAD + p.x * span, PAD + p.y * span] as const;

      ctx.clearRect(0, 0, size, size);
      // 方眼
      ctx.strokeStyle = color("--tsp-grid");
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const v = PAD + (span * i) / 10;
        ctx.moveTo(PAD, v);
        ctx.lineTo(PAD + span, v);
        ctx.moveTo(v, PAD);
        ctx.lineTo(v, PAD + span);
      }
      ctx.stroke();

      // 経路
      const r = route.current;
      if (r && r.length === points.length) {
        const f = flash.current;
        ctx.save();
        ctx.lineJoin = "round";
        ctx.strokeStyle = color("--tsp-route");
        ctx.shadowColor = color("--tsp-route");
        ctx.shadowBlur = 6 + 18 * f;
        ctx.lineWidth = 1.8 + 1.4 * f;
        ctx.beginPath();
        r.forEach((idx, i) => {
          const [x, y] = px(points[idx]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // 都市
      const dot = points.length > 200 ? 1.8 : 2.8;
      ctx.fillStyle = color("--tsp-city");
      for (const p of points) {
        const [x, y] = px(p);
        ctx.beginPath();
        ctx.arc(x, y, dot, 0, Math.PI * 2);
        ctx.fill();
      }
      // 出発点（経路の先頭）
      if (r && r.length === points.length) {
        const [x, y] = px(points[r[0]]);
        ctx.fillStyle = color("--tsp-start");
        ctx.beginPath();
        ctx.arc(x, y, dot + 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawRef.current = draw;
    // 経路が変わったら光らせ、消えるまで描き続ける。それ以外は1回だけ描く
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (routeVersion !== lastVersion.current) {
      lastVersion.current = routeVersion;
      flash.current = reduce ? 0 : 1;
    }
    cancelAnimationFrame(raf.current);
    const loop = () => {
      draw();
      if (flash.current > 0.01) {
        flash.current *= 0.86;
        raf.current = requestAnimationFrame(loop);
      } else {
        flash.current = 0;
      }
    };
    loop();
    return () => cancelAnimationFrame(raf.current);
  }, [points, route, routeVersion]);

  // 大きさとテーマが変わったら描き直す
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const redraw = () => drawRef.current?.();
    const ro = new ResizeObserver(redraw);
    ro.observe(el);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", redraw);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", redraw);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      className="tsp-canvas"
      data-testid="route-canvas"
      role="img"
      aria-label={`${points.length} 個の都市と、これまでに見つかった最短の巡回路`}
    />
  );
}
