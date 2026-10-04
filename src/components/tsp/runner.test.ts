import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./engine/ga";
import { generatePoints } from "./engine/points";
import { createRng } from "./engine/rng";
import type { FromWorker, Snapshot, ToWorker } from "./protocol";
import { Runner } from "./runner";

/** 偽の host。now() は呼ばれるたびに 1ms 進む。defer は待ち行列に積むだけで、flush で1つずつ回す */
function setup(opts = { sliceMs: 3, frameMs: 10 }) {
  const posted: FromWorker[] = [];
  const queue: (() => void)[] = [];
  let clock = 0;
  const runner = new Runner(
    {
      post: (m) => posted.push(m),
      now: () => clock++,
      defer: (fn) => queue.push(fn),
    },
    opts,
  );
  const send = (m: ToWorker) => runner.handle(m);
  const flush = (ticks: number) => {
    for (let i = 0; i < ticks && queue.length; i++) queue.shift()!();
  };
  const snaps = () => posted.filter((m): m is Snapshot => m.type === "snapshot");
  const last = () => snaps().at(-1)!;
  const init = (seed = 1) => send({ type: "init", points: generatePoints("random", 25, createRng(seed)), params: DEFAULT_PARAMS, seed });
  return { posted, queue, send, flush, snaps, last, init };
}

describe("Runner", () => {
  it("init で世代0の状態を送り、最短の経路を載せる", () => {
    const t = setup();
    t.init();
    const s = t.last();
    expect(s.generation).toBe(0);
    expect(s.running).toBe(false);
    expect(s.bestRoute).toHaveLength(25);
    expect(s.populationSize).toBe(100);
    expect(s.epoch).toBe(1);
  });

  it("start すると区切りごとに世代が進み、間隔をあけて状態を送る", () => {
    const t = setup();
    t.init();
    t.send({ type: "start" });
    expect(t.last().running).toBe(true);
    t.flush(20);
    const gens = t.snaps().map((s) => s.generation);
    expect(gens.at(-1)!).toBeGreaterThan(0);
    // 世代は減らない
    for (let i = 1; i < gens.length; i++) expect(gens[i]).toBeGreaterThanOrEqual(gens[i - 1]);
    // 毎区切りではなく、frameMs ごとに送る（区切りの数より少ない）
    expect(t.snaps().length).toBeLessThan(20);
    expect(t.last().generationsPerSecond).toBeGreaterThan(0);
  });

  it("経路は、最短が更新されたときだけ載せる", () => {
    const t = setup();
    t.init();
    t.send({ type: "start" });
    t.flush(50);
    const withRoute = t.snaps().filter((s) => s.bestRoute);
    const without = t.snaps().filter((s) => !s.bestRoute);
    expect(withRoute.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);
    // 載せたときは、最短の世代が前回と違う
    const gensWithRoute = withRoute.map((s) => s.bestGeneration);
    expect(new Set(gensWithRoute).size).toBe(gensWithRoute.length);
  });

  it("pause すると止まり、予約済みの区切りが来ても進まない", () => {
    const t = setup();
    t.init();
    t.send({ type: "start" });
    t.flush(5);
    t.send({ type: "pause" });
    const gen = t.last().generation;
    expect(t.last().running).toBe(false);
    expect(t.last().generationsPerSecond).toBe(0);
    t.flush(10);
    expect(t.last().generation).toBe(gen);
    expect(t.queue).toHaveLength(0);
  });

  it("二重の start と、止まっているときの pause は何もしない", () => {
    const t = setup();
    t.init();
    t.send({ type: "pause" });
    expect(t.snaps()).toHaveLength(1);
    t.send({ type: "start" });
    t.send({ type: "start" });
    expect(t.queue).toHaveLength(1);
  });

  it("step は指定した世代だけ進める（0 以下は1世代）", () => {
    const t = setup();
    t.init();
    t.send({ type: "step", generations: 5 });
    expect(t.last().generation).toBe(5);
    t.send({ type: "step", generations: 0 });
    expect(t.last().generation).toBe(6);
  });

  it("setParams は回している最中でも反映される", () => {
    const t = setup();
    t.init();
    t.send({ type: "start" });
    t.flush(3);
    t.send({ type: "setParams", params: { populationSize: 40 } });
    expect(t.last().populationSize).toBe(40);
    t.flush(3);
    expect(t.last().populationSize).toBe(40);
  });

  it("走っている最中に init し直すと、古い区切りは捨て、番号（epoch）を進める", () => {
    const t = setup();
    t.init(1);
    t.send({ type: "start" });
    t.flush(3);
    t.init(2);
    const s = t.last();
    expect(s.epoch).toBe(2);
    expect(s.generation).toBe(0);
    expect(s.running).toBe(false);
    t.flush(10);
    expect(t.last().generation).toBe(0);
  });

  it("init より前の操作はエラーとして返す", () => {
    const t = setup();
    t.send({ type: "start" });
    expect(t.posted).toEqual([{ type: "error", message: "init より前に操作された" }]);
  });

  it("init が失敗したら、エラーとして返す（点が少なすぎる）", () => {
    const t = setup();
    t.send({ type: "init", points: [{ x: 0, y: 0 }], params: DEFAULT_PARAMS, seed: 1 });
    expect(t.posted.at(-1)?.type).toBe("error");
  });

  it("区切りの途中で例外が出たら、止めてエラーを返す", () => {
    const posted: FromWorker[] = [];
    const queue: (() => void)[] = [];
    let calls = 0;
    const r = new Runner(
      {
        post: (m) => posted.push(m),
        // start までは普通に進み、区切りの中で時計が壊れる
        now: () => {
          if (++calls > 2) throw new Error("時計が壊れた");
          return calls;
        },
        defer: (fn) => queue.push(fn),
      },
      { sliceMs: 3, frameMs: 10 },
    );
    r.handle({ type: "init", points: generatePoints("random", 10, createRng(1)), params: DEFAULT_PARAMS, seed: 1 });
    r.handle({ type: "start" });
    queue.shift()!();
    expect(posted.at(-1)).toEqual({ type: "error", message: "時計が壊れた" });
    const snaps = posted.filter((m): m is Snapshot => m.type === "snapshot");
    expect(snaps.at(-1)!.running).toBe(false);
    expect(queue).toHaveLength(0);
  });

  describe("速さの上限（setSpeed）", () => {
    /**
     * 時計を外から進められる host。now() は呼ばれるたびに 0.5ms 進む
     * （止めたままだと、上限なしの区切りが「時間が過ぎるまで回す」ので終わらない）
     */
    function paced(generationsPerSecond: number) {
      const posted: FromWorker[] = [];
      const queue: { fn: () => void; delay: number }[] = [];
      let clock = 0;
      const r = new Runner(
        { post: (m) => posted.push(m), now: () => (clock += 0.5), defer: (fn, delay = 0) => queue.push({ fn, delay }) },
        { sliceMs: 12, frameMs: 33 },
      );
      r.handle({ type: "setSpeed", generationsPerSecond }); // init の前でもよい
      r.handle({ type: "init", points: generatePoints("random", 15, createRng(1)), params: DEFAULT_PARAMS, seed: 1 });
      r.handle({ type: "start" });
      const advance = (ms: number) => {
        const end = clock + ms;
        while (queue.length) {
          const next = queue[0];
          if (clock + next.delay > end) break;
          queue.shift();
          clock += next.delay;
          next.fn();
        }
        clock = Math.max(clock, end);
      };
      const generation = () => {
        r.handle({ type: "step", generations: 0 }); // 状態を送らせる（1世代進むので引く）
        const s = posted.filter((m): m is Snapshot => m.type === "snapshot").at(-1)!;
        return s.generation - 1;
      };
      return { advance, generation, queue, handle: (m: ToWorker) => r.handle(m) };
    }

    it("1秒あたりの上限を超えて進まない", () => {
      const t = paced(100);
      t.advance(1000);
      const g = t.generation();
      expect(g).toBeGreaterThanOrEqual(90);
      expect(g).toBeLessThanOrEqual(101);
    });

    it("上限があるときは、待ち時間をはさんで予約する（何もしない区切りで回り続けない）", () => {
      const t = paced(100);
      expect(t.queue[0].delay).toBe(0); // 開始直後の1回目はすぐ
      t.advance(50);
      expect(t.queue.at(-1)!.delay).toBe(10);
    });

    it("上限は frameMs を超えて待たない（遅すぎる速さでも画面が更新される）", () => {
      const t = paced(1);
      t.advance(100);
      expect(t.queue.at(-1)!.delay).toBe(33);
    });

    it("0 にすると上限なしに戻る", () => {
      const t = paced(10);
      t.handle({ type: "setSpeed", generationsPerSecond: 0 });
      t.advance(20);
      expect(t.queue.at(-1)!.delay).toBe(0);
    });

    it("数でない値は上限なしとして扱う", () => {
      const t = paced(Number.NaN);
      t.advance(1);
      expect(t.queue.at(-1)!.delay).toBe(0);
    });
  });

  it("既定の区切りの長さでも動く", () => {
    const posted: FromWorker[] = [];
    let clock = 0;
    const r = new Runner({ post: (m) => posted.push(m), now: () => (clock += 5), defer: () => {} });
    r.handle({ type: "init", points: generatePoints("circle", 10, createRng(1)), params: DEFAULT_PARAMS, seed: 1 });
    r.handle({ type: "start" });
    expect(posted.at(-1)).toMatchObject({ type: "snapshot", running: true });
  });
});
