import { useCallback, useEffect, useRef, useState } from "react";
import type { SolveInput } from "./engine/solve";
import type { FromWorker, Progress, ToWorker } from "./protocol";

/**
 * 勤務表を直す・組む Worker との窓口。画面のスレッドでは計算しない（だから UI が固まらない）。
 * Worker は最初に使うときに作る（チェッカーだけ使う人には要らない）
 */
export function useSolver() {
  const worker = useRef<Worker | null>(null);
  const run = useRef(0);
  const [progress, setProgress] = useState<Progress & { done: boolean }>();
  const [grid, setGrid] = useState<string[][]>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);

  useEffect(() => () => worker.current?.terminate(), []);

  const post = (m: ToWorker) => worker.current?.postMessage(m);

  const start = useCallback((input: SolveInput, seconds: number) => {
    if (!worker.current) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.run !== run.current) return; // 前に始めた計算の結果が遅れて届いた
        if (m.type === "error") {
          setError(m.message);
          setProgress(undefined);
          setRunning(false);
          return;
        }
        setProgress({ ...m, done: m.type === "done" });
        if (m.type === "done") {
          setGrid(m.grid);
          setRunning(false);
        }
      };
      w.onerror = (e) => {
        setError(e.message || "Worker でエラーが起きた");
        setRunning(false);
      };
      worker.current = w;
    }
    run.current++;
    setGrid(undefined);
    setProgress(undefined);
    setError(undefined);
    setRunning(true);
    post({ type: "start", run: run.current, input, seconds });
  }, []);

  // いまの計算を止める。止めた時点でいちばん良い案が届く
  const stop = useCallback(() => post({ type: "stop", run: run.current }), []);

  // 案を捨てる（計算中なら、結果も受け取らない）
  const discard = useCallback(() => {
    post({ type: "stop", run: run.current });
    run.current++;
    setGrid(undefined);
    setProgress(undefined);
    setRunning(false);
  }, []);

  return { start, stop, discard, progress, grid, error, running };
}
