import { useCallback, useEffect, useRef, useState } from "react";
import type { GaParams } from "./engine/ga";
import type { Point } from "./engine/points";
import type { FromWorker, Snapshot, ToWorker } from "./protocol";

/**
 * GA を回す Worker との窓口。画面のスレッドでは計算しない（だから UI が固まらない）。
 * 経路は再描画のたびに作り直さないよう、state ではなく ref に持つ
 */
export function useTspWorker() {
  const worker = useRef<Worker | null>(null);
  const epoch = useRef(0);
  const route = useRef<number[] | null>(null);
  const routeVersion = useRef(0);
  const pending = useRef<ToWorker[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "error") {
        setError(m.message);
        return;
      }
      if (m.epoch !== epoch.current) return; // 作り直す前の環境の結果が遅れて届いた
      if (m.bestRoute) {
        route.current = m.bestRoute;
        routeVersion.current++;
      }
      setSnapshot(m);
    };
    w.onerror = (e) => setError(e.message || "Worker でエラーが起きた");
    worker.current = w;
    for (const m of pending.current.splice(0)) w.postMessage(m);
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  const send = useCallback((m: ToWorker) => {
    if (worker.current) worker.current.postMessage(m);
    else pending.current.push(m);
  }, []);

  const init = useCallback(
    (points: Point[], params: GaParams, seed: number) => {
      epoch.current++;
      route.current = null;
      routeVersion.current++;
      setError(null);
      setSnapshot(null);
      send({ type: "init", points, params, seed });
    },
    [send],
  );

  return { snapshot, error, route, routeVersion, init, send };
}
