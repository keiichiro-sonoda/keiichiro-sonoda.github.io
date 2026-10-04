import { describe, expect, it } from "vitest";
import { DistanceMatrix, isPermutation, routeLength } from "./distance";

const square = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

describe("DistanceMatrix", () => {
  it("対称で、対角は 0", () => {
    const dm = new DistanceMatrix(square);
    expect(dm.n).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(dm.get(i, i)).toBe(0);
      for (let j = 0; j < 4; j++) expect(dm.get(i, j)).toBe(dm.get(j, i));
    }
    expect(dm.get(0, 2)).toBeCloseTo(Math.SQRT2, 12);
  });
});

describe("routeLength", () => {
  const dm = new DistanceMatrix(square);
  it("最後の点から最初の点へ戻る辺も数える", () => {
    expect(routeLength([0, 1, 2, 3], dm)).toBeCloseTo(4, 12);
  });
  it("交差する巡回路は長い", () => {
    expect(routeLength([0, 2, 1, 3], dm)).toBeCloseTo(2 + 2 * Math.SQRT2, 12);
  });
  it("回転・逆向きでも長さは同じ", () => {
    expect(routeLength([2, 3, 0, 1], dm)).toBeCloseTo(4, 12);
    expect(routeLength([3, 2, 1, 0], dm)).toBeCloseTo(4, 12);
  });
});

describe("isPermutation", () => {
  it("0〜n-1 をちょうど1回ずつ含むものだけ通す", () => {
    expect(isPermutation([2, 0, 1], 3)).toBe(true);
    expect(isPermutation([0, 0, 1], 3)).toBe(false);
    expect(isPermutation([0, 1], 3)).toBe(false);
    expect(isPermutation([0, 1, 3], 3)).toBe(false);
    expect(isPermutation([0, 1, -1], 3)).toBe(false);
    expect(isPermutation([0, 1, 1.5], 3)).toBe(false);
  });
});
