// 勤務表を直す・組む計算を、画面とは別のスレッドで回す入口。中身は Solver（engine/solve.ts）にある
import { Solver } from "./engine/solve";
import type { FromWorker, ToWorker } from "./protocol";

// setTimeout(0) は入れ子が深くなると 4ms に間引かれるので、MessageChannel で次のタスクを予約する
const channel = new MessageChannel();
let next: (() => void) | undefined;
channel.port1.onmessage = () => next?.();

// tsconfig は DOM の型なので、self を Worker の形に読み替える（Window.postMessage は引数の形が違う）
const scope = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };

let current = -1;
let stopped = false;

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === "stop") {
    if (m.run === current) stopped = true;
    return;
  }
  current = m.run;
  stopped = false;
  let solver: Solver;
  try {
    solver = new Solver(m.input);
  } catch (err) {
    scope.postMessage({ type: "error", run: m.run, message: String(err) });
    return;
  }
  const started = performance.now();
  const total = m.seconds * 1000;
  const progress = () => ({
    run: m.run,
    elapsed: performance.now() - started,
    iterations: solver.iterations,
    initial: solver.initial,
    best: solver.best,
  });
  const slice = () => {
    if (m.run !== current) return;
    const until = performance.now() + 50;
    // 区切りごとに止める指示を受け取れるよう、50ms ずつ回して次のタスクに回す
    while (performance.now() < until) solver.run(1000, (performance.now() - started) / total);
    if (stopped || performance.now() - started >= total) {
      scope.postMessage({ type: "done", grid: solver.bestGrid, ...progress() });
      return;
    }
    scope.postMessage({ type: "progress", ...progress() });
    next = slice;
    channel.port2.postMessage(null);
  };
  slice();
};
