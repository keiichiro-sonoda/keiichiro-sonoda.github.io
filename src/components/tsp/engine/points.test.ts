import { describe, expect, it } from "vitest";
import { DistanceMatrix, routeLength } from "./distance";
import { LAYOUTS, circleOptimum, clamp, generatePoints, type Layout } from "./points";
import { createRng } from "./rng";

const layouts: Layout[] = LAYOUTS.map((l) => l.id);

describe("generatePoints", () => {
  it.each(layouts)("%s: 指定した数の点が、すべて [0, 1] に収まる（元の二重の円ははみ出していた）", (layout) => {
    for (const n of [3, 10, 101, 500]) {
      const pts = generatePoints(layout, n, createRng(n), { innerRatio: 0.3 });
      expect(pts).toHaveLength(n);
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(layouts)("%s: 同じシードなら同じ配置になる", (layout) => {
    expect(generatePoints(layout, 40, createRng(9))).toEqual(generatePoints(layout, 40, createRng(9)));
  });

  it("ランダムは、シードが違えば配置も違う", () => {
    expect(generatePoints("random", 20, createRng(1))).not.toEqual(generatePoints("random", 20, createRng(2)));
  });

  it("円: 順に回る巡回路の長さが、正多角形の周と一致する", () => {
    const n = 48;
    const pts = generatePoints("circle", n, createRng(1));
    const route = Array.from({ length: n }, (_, i) => i);
    expect(routeLength(route, new DistanceMatrix(pts))).toBeCloseTo(circleOptimum(n), 10);
  });

  it("二重の円: 内側の点は、比のぶんだけ中心に近い", () => {
    const pts = generatePoints("concentric", 20, createRng(1), { innerRatio: 0.5 });
    const r = (p: { x: number; y: number }) => Math.hypot(p.x - 0.5, p.y - 0.5);
    expect(r(pts[0])).toBeCloseTo(0.45, 10);
    expect(r(pts[19])).toBeCloseTo(0.225, 10);
  });

  it("二重の円: 比が範囲外なら丸める", () => {
    const pts = generatePoints("concentric", 10, createRng(1), { innerRatio: 5 });
    expect(Math.hypot(pts[9].x - 0.5, pts[9].y - 0.5)).toBeCloseTo(0.45 * 0.95, 10);
  });

  it("点が3つ未満・整数でないときは作らない", () => {
    expect(() => generatePoints("random", 2, createRng(1))).toThrow(RangeError);
    expect(() => generatePoints("random", 3.5, createRng(1))).toThrow(RangeError);
  });
});

describe("clamp", () => {
  it("範囲の外を端に寄せる", () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.3, 0, 1)).toBe(0.3);
  });
});
