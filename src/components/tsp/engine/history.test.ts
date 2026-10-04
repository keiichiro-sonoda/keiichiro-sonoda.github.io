import { describe, expect, it } from "vitest";
import { HistoryLog } from "./history";

describe("HistoryLog", () => {
  it("上限までは全部残す", () => {
    const h = new HistoryLog(10);
    for (let g = 0; g < 10; g++) h.push(g, 100 - g);
    expect(h.points()).toHaveLength(10);
    expect(h.recordInterval).toBe(1);
  });

  it("上限を超えたら間隔を2倍にし、点の数を上限以下に保つ", () => {
    const h = new HistoryLog(10);
    for (let g = 0; g <= 1000; g++) h.push(g, 1000 - g);
    const pts = h.points();
    expect(pts.length).toBeLessThanOrEqual(11); // 記録した点 + 最新
    expect(h.recordInterval).toBeGreaterThan(1);
    // 記録した点は間隔の倍数だけ
    for (const [g] of pts.slice(0, -1)) expect(g % h.recordInterval).toBe(0);
  });

  it("最新の世代は、間隔の倍数でなくても最後に入る（グラフの右端が遅れない）", () => {
    const h = new HistoryLog(4);
    for (let g = 0; g <= 9; g++) h.push(g, g);
    expect(h.points().at(-1)).toEqual([9, 9]);
  });

  it("最新が記録済みの点と同じなら、二重に入れない", () => {
    const h = new HistoryLog(4);
    h.push(0, 5);
    h.push(1, 4);
    expect(h.points()).toEqual([
      [0, 5],
      [1, 4],
    ]);
  });

  it("まだ何も無ければ空", () => {
    expect(new HistoryLog().points()).toEqual([]);
  });

  it("上限が小さすぎる設定は受け付けない", () => {
    expect(() => new HistoryLog(1)).toThrow(RangeError);
  });
});
