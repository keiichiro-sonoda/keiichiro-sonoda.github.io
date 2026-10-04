// GA を画面とは別のスレッドで回す入口。中身は Runner（runner.ts）にある
import { Runner } from "./runner";
import type { FromWorker, ToWorker } from "./protocol";

// setTimeout(0) は入れ子が深くなると 4ms に間引かれるので、MessageChannel で次のタスクを予約する
const channel = new MessageChannel();
const queue: (() => void)[] = [];
channel.port1.onmessage = () => queue.shift()?.();

// tsconfig は DOM の型なので、self を Worker の形に読み替える（Window.postMessage は引数の形が違う）
const scope = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };

const runner = new Runner({
  post: (m) => scope.postMessage(m),
  now: () => performance.now(),
  defer: (fn, delayMs = 0) => {
    // 速さに上限があるときは待つ（待たずに回すと、何もしない区切りで CPU を使い続ける）
    if (delayMs > 0) {
      setTimeout(fn, delayMs);
      return;
    }
    queue.push(fn);
    channel.port2.postMessage(null);
  },
});

scope.onmessage = (e) => runner.handle(e.data);
