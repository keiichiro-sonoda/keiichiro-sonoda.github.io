// 遺伝的アルゴリズムの本体。画面にも Worker にも依存しない（単体テストはここを直接たたく）
import { DistanceMatrix, routeLength } from "./distance";
import { HistoryLog } from "./history";
import { crossoverPair, mutate, randomRoute, tournamentSelect, type Route } from "./operators";
import type { Point } from "./points";
import type { Rng } from "./rng";

export interface GaParams {
  /** 個体数 */
  populationSize: number;
  /** 子1つあたりに 2-opt 変異をかける確率 */
  mutationRate: number;
  /** トーナメント選択で抜き出す数 */
  tournamentSize: number;
  /** いちばん短い個体を、そのまま次の世代に残すか */
  elitism: boolean;
}

export const PARAM_LIMITS = {
  populationSize: { min: 10, max: 1000 },
  mutationRate: { min: 0, max: 1 },
  tournamentSize: { min: 2, max: 10 },
} as const;

export const DEFAULT_PARAMS: GaParams = { populationSize: 100, mutationRate: 0.25, tournamentSize: 3, elitism: true };

export function normalizeParams(p: GaParams): GaParams {
  const c = (v: number, k: keyof typeof PARAM_LIMITS) =>
    Math.min(PARAM_LIMITS[k].max, Math.max(PARAM_LIMITS[k].min, Number.isFinite(v) ? v : PARAM_LIMITS[k].min));
  return {
    populationSize: Math.round(c(p.populationSize, "populationSize")),
    mutationRate: c(p.mutationRate, "mutationRate"),
    tournamentSize: Math.round(c(p.tournamentSize, "tournamentSize")),
    elitism: Boolean(p.elitism),
  };
}

export interface Best {
  route: Route;
  length: number;
  /** 見つかった世代 */
  generation: number;
}

export class GeneticAlgorithm {
  readonly dm: DistanceMatrix;
  readonly history = new HistoryLog();
  generation = 0;
  private population: Route[];
  private lengths: Float64Array;
  private params: GaParams;
  /** これまでに見つかった最短（エリート保存なしだと、今の世代の最短より短いことがある） */
  private bestEver: Best;
  readonly initialLength: number;

  constructor(points: readonly Point[], params: GaParams, private readonly rng: Rng) {
    if (points.length < 3) throw new RangeError(`巡回路には3つ以上の点が要る（${points.length} 個）`);
    this.dm = new DistanceMatrix(points);
    this.params = normalizeParams(params);
    this.population = Array.from({ length: this.params.populationSize }, () => randomRoute(points.length, rng));
    this.lengths = this.measure(this.population);
    const i = argmin(this.lengths);
    this.bestEver = { route: this.population[i].slice(), length: this.lengths[i], generation: 0 };
    this.initialLength = this.lengths[i];
    this.history.push(0, this.lengths[i]);
  }

  get size(): number {
    return this.population.length;
  }

  get currentParams(): GaParams {
    return { ...this.params };
  }

  /** 今の世代の最短の長さ */
  get currentBestLength(): number {
    return this.lengths[argmin(this.lengths)];
  }

  get best(): Best {
    return { ...this.bestEver, route: this.bestEver.route.slice() };
  }

  /** 1世代進める */
  step(): void {
    const { populationSize, mutationRate, tournamentSize, elitism } = this.params;
    const next: Route[] = [];
    if (elitism) next.push(this.population[argmin(this.lengths)].slice());
    while (next.length < populationSize) {
      const p1 = this.population[tournamentSelect(this.lengths, tournamentSize, this.rng)];
      const p2 = this.population[tournamentSelect(this.lengths, tournamentSize, this.rng)];
      const [c1, c2] = crossoverPair(p1, p2, this.rng);
      next.push(mutate(c1, mutationRate, this.rng));
      if (next.length < populationSize) next.push(mutate(c2, mutationRate, this.rng));
    }
    this.population = next;
    this.lengths = this.measure(next);
    this.generation += 1;
    const i = argmin(this.lengths);
    if (this.lengths[i] < this.bestEver.length) {
      this.bestEver = { route: next[i].slice(), length: this.lengths[i], generation: this.generation };
    }
    this.history.push(this.generation, this.lengths[i]);
  }

  run(generations: number): void {
    for (let k = 0; k < generations; k++) this.step();
  }

  /**
   * 途中でパラメータを変える。個体数が減るときはトーナメント選択で残す個体を選び（エリート保存ならいちばん短いものは必ず残す）、
   * 増えるときはでたらめな個体を足す（元の実装と同じ）
   */
  setParams(patch: Partial<GaParams>): void {
    const next = normalizeParams({ ...this.params, ...patch });
    const target = next.populationSize;
    if (target < this.population.length) {
      const keep: Route[] = [];
      if (next.elitism) keep.push(this.population[argmin(this.lengths)]);
      while (keep.length < target) keep.push(this.population[tournamentSelect(this.lengths, next.tournamentSize, this.rng)]);
      this.population = keep.map((r) => r.slice());
      this.lengths = this.measure(this.population);
    } else if (target > this.population.length) {
      const n = this.dm.n;
      const added = Array.from({ length: target - this.population.length }, () => randomRoute(n, this.rng));
      this.population = [...this.population, ...added];
      this.lengths = this.measure(this.population);
    }
    this.params = next;
  }

  private measure(pop: Route[]): Float64Array {
    const out = new Float64Array(pop.length);
    for (let i = 0; i < pop.length; i++) out[i] = routeLength(pop[i], this.dm);
    return out;
  }
}

function argmin(a: Float64Array): number {
  let k = 0;
  for (let i = 1; i < a.length; i++) if (a[i] < a[k]) k = i;
  return k;
}
