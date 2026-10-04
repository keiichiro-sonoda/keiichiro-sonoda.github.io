// 画面と Worker のあいだのメッセージ
import type { GaParams } from "./engine/ga";
import type { Point } from "./engine/points";

export type ToWorker =
  | { type: "init"; points: Point[]; params: GaParams; seed: number }
  | { type: "start" }
  | { type: "pause" }
  | { type: "step"; generations: number }
  | { type: "setParams"; params: Partial<GaParams> }
  /** 1秒あたりの世代の上限。0 なら上限なし（全力） */
  | { type: "setSpeed"; generationsPerSecond: number };

export interface Snapshot {
  type: "snapshot";
  /** init ごとに増える番号。古い環境の結果が遅れて届いても捨てられるように */
  epoch: number;
  running: boolean;
  generation: number;
  bestLength: number;
  bestGeneration: number;
  /** 最短が更新されたときだけ載せる（毎回送らない） */
  bestRoute?: number[];
  currentLength: number;
  initialLength: number;
  history: [number, number][];
  generationsPerSecond: number;
  populationSize: number;
}

export type FromWorker = Snapshot | { type: "error"; message: string };
