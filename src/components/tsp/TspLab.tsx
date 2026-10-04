// 巡回セールスマン問題を遺伝的アルゴリズムで解く実験台。計算は Worker、ここは表示と操作だけ
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ConvergenceChart from "./ConvergenceChart";
import RouteCanvas from "./RouteCanvas";
import { DEFAULT_PARAMS, PARAM_LIMITS, type GaParams } from "./engine/ga";
import { LAYOUTS, circleOptimum, generatePoints, type Layout } from "./engine/points";
import { createRng, newSeed } from "./engine/rng";
import { useTspWorker } from "./useTspWorker";
import "./tsp.css";

interface Env {
  layout: Layout;
  count: number;
  innerRatio: number;
  seed: number;
}

const COUNT = { min: 10, max: 500 };
// 1秒あたりの世代の上限。全力だと 80 都市が1秒足らずで収束して、進化の様子が見えない
const SPEEDS = [
  { id: "slow", label: "ゆっくり", value: 20 },
  { id: "normal", label: "ふつう", value: 200 },
  { id: "fast", label: "はやい", value: 2000 },
  { id: "max", label: "全力", value: 0 },
] as const;
type SpeedId = (typeof SPEEDS)[number]["id"];
const INITIAL_ENV: Env = { layout: "random", count: 80, innerRatio: 0.5, seed: 20230711 };

export default function TspLab() {
  const [env, setEnv] = useState<Env>(INITIAL_ENV);
  const [params, setParams] = useState<GaParams>(DEFAULT_PARAMS);
  const [speed, setSpeed] = useState<SpeedId>("normal");
  const { snapshot, error, route, routeVersion, init, send } = useTspWorker();

  useEffect(() => {
    send({ type: "setSpeed", generationsPerSecond: SPEEDS.find((s) => s.id === speed)!.value });
  }, [speed, send]);

  const points = useMemo(
    () => generatePoints(env.layout, env.count, createRng(env.seed), { innerRatio: env.innerRatio }),
    [env],
  );
  const optimum = env.layout === "circle" ? circleOptimum(env.count) : undefined;

  // 都市の配置が変わったら作り直す（走っていても止まる）。params はここでは読まない（途中変更は setParams で送る）
  useEffect(() => init(points, params, env.seed), [points, init]);

  const running = snapshot?.running ?? false;
  const updateParam = <K extends keyof GaParams>(key: K, value: GaParams[K]) => {
    setParams((p) => ({ ...p, [key]: value }));
    send({ type: "setParams", params: { [key]: value } });
  };
  const updateEnv = (patch: Partial<Env>) => setEnv((e) => ({ ...e, ...patch }));

  const best = snapshot?.bestLength;
  const gain = snapshot && snapshot.initialLength > 0 ? 1 - snapshot.bestLength / snapshot.initialLength : 0;
  // 浮動小数点の誤差で最適よりわずかに短く出ることがあり、-0.00% と出ないよう 0 で止める
  const gap = best !== undefined && optimum !== undefined ? Math.max(0, best / optimum - 1) : undefined;

  return (
    <div className="tsp">
        <div className="tsp-stage">
          <RouteCanvas points={points} route={route} routeVersion={routeVersion.current} />
          <div className="tsp-badge" data-state={running ? "running" : "paused"} data-testid="status">
            {running ? "進化中" : snapshot ? "一時停止" : "準備中"}
          </div>
        </div>

        <div className="tsp-chart-box">
          <div className="tsp-chart-title">世代ごとの最短距離</div>
          <ConvergenceChart history={snapshot?.history ?? []} optimum={optimum} />
        </div>

        <div className="tsp-side">
          <div className="tsp-stats">
            <Stat label="世代" value={snapshot ? snapshot.generation.toLocaleString() : "—"} testId="generation" />
            <Stat label="最短距離" value={best !== undefined ? best.toFixed(3) : "—"} testId="best" />
            <Stat label="はじめから" value={snapshot ? `−${(gain * 100).toFixed(1)}%` : "—"} testId="gain" />
            {gap !== undefined ? (
              <Stat label="理論上の最短との差" value={`+${(gap * 100).toFixed(2)}%`} testId="gap" />
            ) : (
              <Stat
                label="速さ（世代/秒）"
                value={running && snapshot ? Math.round(snapshot.generationsPerSecond).toLocaleString() : "—"}
                testId="speed"
              />
            )}
          </div>

          <div className="tsp-buttons">
            <button
              className="tsp-primary"
              data-testid="toggle"
              disabled={!snapshot}
              onClick={() => send({ type: running ? "pause" : "start" })}
            >
              {running ? "❚❚ 一時停止" : "▶ 開始"}
            </button>
            <button data-testid="step" disabled={!snapshot || running} onClick={() => send({ type: "step", generations: 1 })}>
              1世代すすめる
            </button>
            <button data-testid="restart" onClick={() => init(points, params, env.seed)}>
              最初から
            </button>
            <button data-testid="reshuffle" onClick={() => updateEnv({ seed: newSeed() })}>
              配置を変える
            </button>
          </div>
          <div className="tsp-seg tsp-speed" role="group" aria-label="進化の速さ">
            {SPEEDS.map((s) => (
              <button key={s.id} aria-pressed={speed === s.id} data-testid={`speed-${s.id}`} onClick={() => setSpeed(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          {error && (
            <p className="tsp-error" role="alert">
              エラー: {error}
            </p>
          )}

          <Group title="都市の配置" note="変えると最初からやり直します">
            <div className="tsp-seg" role="group" aria-label="都市の配置">
              {LAYOUTS.map((l) => (
                <button key={l.id} aria-pressed={env.layout === l.id} onClick={() => updateEnv({ layout: l.id })}>
                  {l.label}
                </button>
              ))}
            </div>
            <Slider
              label="都市の数"
              value={env.count}
              min={COUNT.min}
              max={COUNT.max}
              step={env.layout === "concentric" ? 2 : 1}
              format={(v) => `${v}`}
              onChange={(v) => updateEnv({ count: v })}
              testId="count"
            />
            {env.layout === "concentric" && (
              <Slider
                label="内側の円の大きさ"
                value={env.innerRatio}
                min={0.1}
                max={0.9}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => updateEnv({ innerRatio: v })}
                testId="inner"
              />
            )}
            <label className="tsp-field">
              <span>シード</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={4294967295}
                value={env.seed}
                data-testid="seed"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isInteger(v) && v >= 0 && v < 2 ** 32) updateEnv({ seed: v });
                }}
              />
            </label>
          </Group>

          <Group title="遺伝的アルゴリズム" note="動かしたままでも変えられます">
            <Slider
              label="個体数"
              value={params.populationSize}
              min={PARAM_LIMITS.populationSize.min}
              max={500}
              step={10}
              format={(v) => `${v}`}
              onChange={(v) => updateParam("populationSize", v)}
              testId="population"
            />
            <Slider
              label="突然変異の確率"
              value={params.mutationRate}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => updateParam("mutationRate", v)}
              testId="mutation"
            />
            <Slider
              label="トーナメントの大きさ"
              value={params.tournamentSize}
              min={PARAM_LIMITS.tournamentSize.min}
              max={PARAM_LIMITS.tournamentSize.max}
              step={1}
              format={(v) => `${v}`}
              onChange={(v) => updateParam("tournamentSize", v)}
              testId="tournament"
            />
            <label className="tsp-toggle">
              <input
                type="checkbox"
                checked={params.elitism}
                data-testid="elitism"
                onChange={(e) => updateParam("elitism", e.target.checked)}
              />
              <span>エリート保存（最短の個体を必ず残す）</span>
            </label>
          </Group>
        </div>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="tsp-stat">
      <span className="tsp-stat-label">{label}</span>
      <span className="tsp-stat-value" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <fieldset className="tsp-group">
      <legend>{title}</legend>
      <p className="tsp-note">{note}</p>
      {children}
    </fieldset>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  testId: string;
}

function Slider({ label, value, min, max, step, format, onChange, testId }: SliderProps) {
  return (
    <label className="tsp-field">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{format(value)}</output>
    </label>
  );
}
