import type { Point } from "./points";

/** 2点間の距離の表。n×n を1本の Float64Array に詰める */
export class DistanceMatrix {
  readonly n: number;
  private readonly d: Float64Array;

  constructor(points: readonly Point[]) {
    const n = points.length;
    this.n = n;
    this.d = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        this.d[i * n + j] = v;
        this.d[j * n + i] = v;
      }
    }
  }

  get(i: number, j: number): number {
    return this.d[i * this.n + j];
  }
}

/** 巡回路の長さ（最後の点から最初の点へ戻る辺も含む） */
export function routeLength(route: ArrayLike<number>, dm: DistanceMatrix): number {
  let sum = 0;
  const n = route.length;
  for (let i = 0; i < n; i++) sum += dm.get(route[i], route[(i + 1) % n]);
  return sum;
}

/** 0〜n-1 をちょうど1回ずつ含むか */
export function isPermutation(route: ArrayLike<number>, n: number): boolean {
  if (route.length !== n) return false;
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = route[i];
    if (!Number.isInteger(v) || v < 0 || v >= n || seen[v]) return false;
    seen[v] = 1;
  }
  return true;
}
