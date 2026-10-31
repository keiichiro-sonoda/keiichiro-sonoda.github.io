// 画面と Worker のあいだのメッセージ
import type { SolveInput, SolveState } from "./engine/solve";

export type ToWorker = { type: "start"; run: number; input: SolveInput; seconds: number } | { type: "stop"; run: number };

export interface Progress {
  run: number;
  elapsed: number;
  iterations: number;
  initial: SolveState;
  best: SolveState;
}

export type FromWorker =
  | ({ type: "progress" } & Progress)
  | ({ type: "done"; grid: string[][] } & Progress)
  | { type: "error"; run: number; message: string };
