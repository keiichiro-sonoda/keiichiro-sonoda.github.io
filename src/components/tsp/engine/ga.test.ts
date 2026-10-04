import { describe, expect, it } from "vitest";
import { isPermutation, routeLength } from "./distance";
import { DEFAULT_PARAMS, GeneticAlgorithm, normalizeParams } from "./ga";
import { circleOptimum, generatePoints } from "./points";
import { createRng } from "./rng";

const pts = (n = 30, seed = 1) => generatePoints("random", n, createRng(seed));

describe("normalizeParams", () => {
  it("範囲の外と整数でない値を丸める", () => {
    expect(normalizeParams({ populationSize: 3, mutationRate: 2, tournamentSize: 99.4, elitism: true })).toEqual({
      populationSize: 10,
      mutationRate: 1,
      tournamentSize: 10,
      elitism: true,
    });
    expect(normalizeParams({ populationSize: 55.6, mutationRate: NaN, tournamentSize: 2.4, elitism: false })).toEqual({
      populationSize: 56,
      mutationRate: 0,
      tournamentSize: 2,
      elitism: false,
    });
  });
});

describe("GeneticAlgorithm", () => {
  it("同じシードなら、同じ進化をたどる", () => {
    const a = new GeneticAlgorithm(pts(), DEFAULT_PARAMS, createRng(5));
    const b = new GeneticAlgorithm(pts(), DEFAULT_PARAMS, createRng(5));
    a.run(30);
    b.run(30);
    expect(a.best).toEqual(b.best);
  });

  it("世代を進めると、最短距離が縮む", () => {
    const ga = new GeneticAlgorithm(pts(40), DEFAULT_PARAMS, createRng(2));
    const before = ga.best.length;
    ga.run(200);
    expect(ga.generation).toBe(200);
    expect(ga.best.length).toBeLessThan(before * 0.7);
  });

  it("円に並べた点では、最適解（正多角形の周）の近くまで縮む", () => {
    const n = 24;
    const ga = new GeneticAlgorithm(generatePoints("circle", n, createRng(1)), { ...DEFAULT_PARAMS, populationSize: 150 }, createRng(3));
    ga.run(400);
    expect(ga.best.length).toBeLessThan(circleOptimum(n) * 1.05);
    expect(ga.best.length).toBeGreaterThanOrEqual(circleOptimum(n) - 1e-9);
  });

  it("エリート保存なら、世代ごとの最短は増えない", () => {
    const ga = new GeneticAlgorithm(pts(), { ...DEFAULT_PARAMS, elitism: true }, createRng(8));
    let prev = ga.currentBestLength;
    for (let g = 0; g < 100; g++) {
      ga.step();
      expect(ga.currentBestLength).toBeLessThanOrEqual(prev + 1e-12);
      prev = ga.currentBestLength;
    }
  });

  it("これまでの最短（best）は、今の世代の最短以下で、長さと経路が食い違わない", () => {
    const ga = new GeneticAlgorithm(pts(), { ...DEFAULT_PARAMS, elitism: false, mutationRate: 1 }, createRng(9));
    for (let g = 0; g < 50; g++) {
      ga.step();
      const best = ga.best;
      expect(best.length).toBeLessThanOrEqual(ga.currentBestLength + 1e-12);
      expect(isPermutation(best.route, 30)).toBe(true);
      expect(routeLength(best.route, ga.dm)).toBeCloseTo(best.length, 9);
      expect(best.generation).toBeLessThanOrEqual(ga.generation);
    }
  });

  it("best は写しを返す（外から書き換えても中身は変わらない）", () => {
    const ga = new GeneticAlgorithm(pts(), DEFAULT_PARAMS, createRng(1));
    const r = ga.best.route;
    r[0] = -1;
    expect(ga.best.route[0]).not.toBe(-1);
  });

  it("履歴は世代0から始まり、最新の世代で終わる", () => {
    const ga = new GeneticAlgorithm(pts(), DEFAULT_PARAMS, createRng(1));
    ga.run(7);
    const h = ga.history.points();
    expect(h[0][0]).toBe(0);
    expect(h.at(-1)![0]).toBe(7);
    expect(ga.initialLength).toBe(h[0][1]);
  });

  it("個体数が奇数でも、ちょうどその数を保つ", () => {
    const ga = new GeneticAlgorithm(pts(), { ...DEFAULT_PARAMS, populationSize: 11, elitism: false }, createRng(1));
    ga.run(3);
    expect(ga.size).toBe(11);
  });

  describe("setParams", () => {
    it("個体数を増やすと、でたらめな個体を足す", () => {
      const ga = new GeneticAlgorithm(pts(), DEFAULT_PARAMS, createRng(1));
      ga.setParams({ populationSize: 150 });
      expect(ga.size).toBe(150);
      expect(ga.currentParams.populationSize).toBe(150);
    });

    it("個体数を減らしても、エリート保存なら最短の個体は残る", () => {
      const ga = new GeneticAlgorithm(pts(), DEFAULT_PARAMS, createRng(1));
      ga.run(20);
      const before = ga.currentBestLength;
      ga.setParams({ populationSize: 10 });
      expect(ga.size).toBe(10);
      expect(ga.currentBestLength).toBe(before);
    });

    it("エリート保存なしで減らしても、指定した数になる", () => {
      const ga = new GeneticAlgorithm(pts(), { ...DEFAULT_PARAMS, elitism: false }, createRng(1));
      ga.setParams({ populationSize: 20, elitism: false });
      expect(ga.size).toBe(20);
    });

    it("個体数を変えないなら、集団はそのまま。ほかの値は反映される", () => {
      const ga = new GeneticAlgorithm(pts(), DEFAULT_PARAMS, createRng(1));
      const before = ga.currentBestLength;
      ga.setParams({ mutationRate: 0.9, tournamentSize: 5, elitism: false });
      expect(ga.size).toBe(100);
      expect(ga.currentBestLength).toBe(before);
      expect(ga.currentParams).toEqual({ populationSize: 100, mutationRate: 0.9, tournamentSize: 5, elitism: false });
    });
  });
});
