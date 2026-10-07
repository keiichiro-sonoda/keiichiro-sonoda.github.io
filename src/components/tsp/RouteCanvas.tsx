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
  const lastChangeAt = useRef(0);
  const raf = useRef(0);
  const drawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const draw = () => {
      const ctx = el.getContext("2d");
      if (!ctx) return;
      // 画素の密度は2倍までにする。スマホ（2.6倍など）でそのまま使うと Canvas が約1000×1000画素になり、
      // 描くたびの受け渡し（Commit）が重くて、進化中のフレームが半分以下に落ちた。2倍でも線の細さは見分けられない
      const dpr = Math.min(2, window.devicePixelRatio || 1);
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
        const path = new Path2D();
        r.forEach((idx, i) => {
          const [x, y] = px(points[idx]);
          if (i === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        });
        path.closePath();
        // 光は shadowBlur を使わず、太い半透明の線を下に敷いて出す。
        // shadowBlur はぼかしの計算が重く、都市が多いと進化中のフレームが半分以下（60 → 12〜28fps）に落ちた
        ctx.save();
        ctx.lineJoin = "round";
        ctx.strokeStyle = color("--tsp-route");
        ctx.globalAlpha = 0.16 + 0.24 * f;
        ctx.lineWidth = 6 + 6 * f;
        ctx.stroke(path);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.8 + 1.2 * f;
        ctx.stroke(path);
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
      // 改善が続いている（前の改善から 300ms 以内）ときは光らせない。全力だとほぼ毎回縮むので、
      // 光が消える前に次が始まり、毎フレーム描き直すことになる。光るのは、しばらく止まっていた後に縮んだときだけ
      const now = performance.now();
      const quiet = now - lastChangeAt.current > 300;
      lastChangeAt.current = now;
      flash.current = reduce || !quiet ? 0 : 1;
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
