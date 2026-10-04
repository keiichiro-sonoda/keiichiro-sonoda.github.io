import { describe, expect, it } from "vitest";
import { createRng, newSeed, randomInt, twoDistinct } from "./rng";

describe("createRng", () => {
  it("同じシードなら同じ列になる", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it("違うシードなら違う列になる", () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it("[0, 1) に収まり、偏りが大きくない", () => {
    const rng = createRng(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });
});

describe("randomInt", () => {
  it("[0, n) の整数を返し、全部の値が出る", () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(rng, 5);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("twoDistinct", () => {
  it("異なる2つを、数値として小さい順に返す（元の実装の文字列ソートの不具合を繰り返さない）", () => {
    const rng = createRng(11);
    for (let i = 0; i < 2000; i++) {
      const [a, b] = twoDistinct(rng, 12);
      expect(a).toBeLessThan(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(12);
    }
  });

  it("どの組も出うる（n = 3 なら3通り）", () => {
    const rng = createRng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(twoDistinct(rng, 3).join(","));
    expect([...seen].sort()).toEqual(["0,1", "0,2", "1,2"]);
  });

  it("n < 2 では選べない", () => {
    expect(() => twoDistinct(createRng(1), 1)).toThrow(RangeError);
  });
});

describe("newSeed", () => {
  it("32ビットの符号なし整数を返す", () => {
    const s = newSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});
