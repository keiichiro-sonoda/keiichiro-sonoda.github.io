// Worker の中で GA を回す役。self や setTimeout に直接依存させず、host を差し込む（単体テストで時計を偽装するため）
import { GeneticAlgorithm } from "./engine/ga";
import { createRng } from "./engine/rng";
import type { FromWorker, Snapshot, ToWorker } from "./protocol";

export interface RunnerHost {
  post(message: FromWorker): void;
  now(): number;
  /** 次の区切りを予約する。間にメッセージ（一時停止など）を受け取れるよう、必ずタスクを分ける。delayMs だけ待ってもよい */
  defer(fn: () => void, delayMs?: number): void;
}

export interface RunnerOptions {
  /** 1回の区切りで計算に使う時間（ミリ秒）。短いほど一時停止への反応が速い */
  sliceMs: number;
  /** 画面へ送る間隔（ミリ秒）。描画の速さより細かく送っても無駄になる */
  frameMs: number;
}

const DEFAULTS: RunnerOptions = { sliceMs: 12, frameMs: 33 };

export class Runner {
  private ga: GeneticAlgorithm | null = null;
  private running = false;
  private epoch = 0;
  private loopToken = 0;
  private sentBestGeneration = -1;
  private lastPostAt = 0;
  private lastPostGeneration = 0;
  private rate = 0;
  /** 1秒あたりの世代の上限（0 = 上限なし）。上限があるときは、paceStart からの経過時間ぶんだけ進める */
  private speed = 0;
  private paceStart = 0;
  private paceGeneration = 0;
  private readonly opts: RunnerOptions;

  constructor(private readonly host: RunnerHost, opts: Partial<RunnerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  handle(msg: ToWorker): void {
    try {
      this.dispatch(msg);
    } catch (e) {
      this.running = false;
      this.host.post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  private dispatch(msg: ToWorker): void {
    if (msg.type === "init") {
      this.running = false;
      this.loopToken++;
      this.epoch++;
      this.ga = new GeneticAlgorithm(msg.points, msg.params, createRng(msg.seed));
      this.sentBestGeneration = -1;
      this.rate = 0;
      this.post();
      return;
    }
    if (msg.type === "setSpeed") {
      // 速さは環境に結びつかない設定なので、init の前に来てもよく、init し直しても引き継ぐ
      this.speed = Number.isFinite(msg.generationsPerSecond) ? Math.max(0, msg.generationsPerSecond) : 0;
      this.resetPace();
      return;
    }
    const ga = this.ga;
    if (!ga) throw new Error("init より前に操作された");
    switch (msg.type) {
      case "start":
        if (this.running) return;
        this.running = true;
        this.lastPostAt = this.host.now();
        this.lastPostGeneration = ga.generation;
        this.resetPace();
        this.post();
        this.schedule(0);
        return;
      case "pause":
        if (!this.running) return;
        this.running = false;
        this.loopToken++;
        this.rate = 0;
        this.post();
        return;
      case "step":
        ga.run(Math.max(1, Math.floor(msg.generations)));
        this.post();
        return;
      case "setParams":
        ga.setParams(msg.params);
        this.post();
        return;
    }
  }

  private resetPace(): void {
    this.paceStart = this.host.now();
    this.paceGeneration = this.ga?.generation ?? 0;
  }

  private schedule(delayMs: number): void {
    const token = this.loopToken;
    this.host.defer(() => this.tick(token), delayMs);
  }

  private tick(token: number): void {
    const ga = this.ga;
    if (!this.running || token !== this.loopToken || !ga) return;
    try {
      const start = this.host.now();
      let delay = 0;
      if (this.speed > 0) {
        // 上限あり: 経過時間から「ここまでに進んでいてよい世代」を出し、その差だけ進める（区切りの時間は超えない）
        const allowed = Math.floor(((start - this.paceStart) * this.speed) / 1000) - (ga.generation - this.paceGeneration);
        for (let k = 0; k < allowed && this.host.now() - start < this.opts.sliceMs; k++) ga.step();
        delay = Math.min(this.opts.frameMs, Math.max(1, 1000 / this.speed));
      } else {
        do ga.step();
        while (this.host.now() - start < this.opts.sliceMs);
      }
      const now = this.host.now();
      if (now - this.lastPostAt >= this.opts.frameMs) {
        this.rate = ((ga.generation - this.lastPostGeneration) * 1000) / (now - this.lastPostAt);
        this.lastPostAt = now;
        this.lastPostGeneration = ga.generation;
        this.post();
      }
      this.schedule(delay);
    } catch (e) {
      this.handle({ type: "pause" });
      this.host.post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  private post(): void {
    const ga = this.ga;
    if (!ga) return;
    const best = ga.best;
    const snap: Snapshot = {
      type: "snapshot",
      epoch: this.epoch,
      running: this.running,
      generation: ga.generation,
      bestLength: best.length,
      bestGeneration: best.generation,
      currentLength: ga.currentBestLength,
      initialLength: ga.initialLength,
      history: ga.history.points(),
      generationsPerSecond: this.rate,
      populationSize: ga.size,
    };
    if (best.generation !== this.sentBestGeneration) {
      snap.bestRoute = best.route;
      this.sentBestGeneration = best.generation;
    }
    this.host.post(snap);
  }
}
