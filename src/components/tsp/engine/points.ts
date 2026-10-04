// 都市（点）の配置。座標はすべて [0, 1] の中に収める
import { randomInt, type Rng } from "./rng";

export interface Point {
  x: number;
  y: number;
}

export type Layout = "random" | "circle" | "concentric" | "clusters";

export const LAYOUTS: { id: Layout; label: string }[] = [
  { id: "random", label: "ランダム" },
  { id: "clusters", label: "まとまり" },
  { id: "circle", label: "円" },
  { id: "concentric", label: "二重の円" },
];

const CENTER = 0.5;
const RADIUS = 0.45;
const MARGIN = 0.04;

export interface LayoutOptions {
  /** 二重の円で、内側の円の半径（外側に対する比。0〜1） */
  innerRatio?: number;
}

export function generatePoints(layout: Layout, n: number, rng: Rng, opts: LayoutOptions = {}): Point[] {
  if (!Number.isInteger(n) || n < 3) throw new RangeError(`点は3つ以上の整数（n = ${n}）`);
  switch (layout) {
    case "random":
      return Array.from({ length: n }, () => ({ x: inside(rng()), y: inside(rng()) }));
    case "circle":
      return ring(n, RADIUS, 0);
    case "concentric": {
      // 元の実装は cos + 0.5 で、座標が -0.5〜1.5 にはみ出していた
      const ratio = clamp(opts.innerRatio ?? 0.5, 0.05, 0.95);
      const outer = Math.ceil(n / 2);
      return [...ring(outer, RADIUS, 0), ...ring(n - outer, RADIUS * ratio, Math.PI / (n - outer))];
    }
    case "clusters":
      return clusters(n, rng);
  }
}

/** 円の上に等間隔に並べた点。最短の巡回路は正多角形の周（{@link circleOptimum}） */
function ring(n: number, r: number, phase: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const t = phase + (2 * Math.PI * i) / n;
    return { x: CENTER + r * Math.cos(t), y: CENTER + r * Math.sin(t) };
  });
}

/** 円に並べたときの最短の巡回路の長さ（正 n 角形の周） */
export function circleOptimum(n: number): number {
  return 2 * n * RADIUS * Math.sin(Math.PI / n);
}

function clusters(n: number, rng: Rng): Point[] {
  const k = Math.max(3, Math.min(8, Math.round(n / 40)));
  const centers = Array.from({ length: k }, () => ({ x: 0.15 + 0.7 * rng(), y: 0.15 + 0.7 * rng() }));
  return Array.from({ length: n }, () => {
    const c = centers[randomInt(rng, k)];
    const [gx, gy] = gaussianPair(rng);
    return { x: inside(c.x + gx * 0.06), y: inside(c.y + gy * 0.06) };
  });
}

/** Box–Muller で標準正規分布の2つ組 */
function gaussianPair(rng: Rng): [number, number] {
  const u = 1 - rng(); // (0, 1]（log(0) を避ける）
  const v = rng();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

function inside(v: number): number {
  return clamp(MARGIN + v * (1 - 2 * MARGIN), MARGIN, 1 - MARGIN);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
