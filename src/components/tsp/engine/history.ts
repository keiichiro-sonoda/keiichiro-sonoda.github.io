/**
 * 世代ごとの最短距離の記録。グラフに出すので、点の数を maxPoints 以下に保つ。
 * 超えたら記録する間隔を2倍にし、新しい間隔の倍数でない点を捨てる（元の実装と同じ考え方）。
 * 最新の世代は間隔に関係なく {@link HistoryLog.points} に含める（グラフの右端が遅れないように）
 */
export class HistoryLog {
  private recorded: [number, number][] = [];
  private latest: [number, number] | null = null;
  private interval = 1;

  constructor(private readonly maxPoints = 240) {
    if (maxPoints < 2) throw new RangeError("maxPoints は2以上");
  }

  push(generation: number, value: number): void {
    this.latest = [generation, value];
    if (generation % this.interval !== 0) return;
    this.recorded.push([generation, value]);
    while (this.recorded.length > this.maxPoints) {
      this.interval *= 2;
      this.recorded = this.recorded.filter(([g]) => g % this.interval === 0);
    }
  }

  points(): [number, number][] {
    const last = this.recorded[this.recorded.length - 1];
    if (this.latest && (!last || last[0] !== this.latest[0])) return [...this.recorded, this.latest];
    return this.recorded.slice();
  }

  get recordInterval(): number {
    return this.interval;
  }
}
