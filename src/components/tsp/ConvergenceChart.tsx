// 世代ごとの最短距離のグラフ。円の配置では、理論上の最短を点線で引く
import { useId } from "react";

interface Props {
  history: [number, number][];
  optimum?: number;
}

// 左の列（幅 400px 前後）にそのまま収まる大きさ。大きくすると縮めて表示され、文字が読めなくなる
const W = 420;
const H = 230;
const M = { top: 22, right: 14, bottom: 28, left: 48 };

export default function ConvergenceChart({ history, optimum }: Props) {
  // useId は : や « を含むことがあり、url(#...) の参照が壊れるので英数字だけにする
  const gradId = `tsp-grad-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  if (history.length === 0) return <div className="tsp-chart tsp-chart-empty" data-testid="chart" />;

  const lastGen = history[history.length - 1][0];
  const values = history.map(([, v]) => v);
  const hi = Math.max(...values);
  let lo = Math.min(...values, optimum ?? Infinity);
  if (hi - lo < 1e-9) lo = hi * 0.9;
  const pad = (hi - lo) * 0.06;
  const y0 = lo - pad;
  const y1 = hi + pad;
  const x = (g: number) => M.left + (lastGen === 0 ? 0 : (g / lastGen) * (W - M.left - M.right));
  const y = (v: number) => M.top + ((y1 - v) / (y1 - y0)) * (H - M.top - M.bottom);

  const line = history.map(([g, v], i) => `${i ? "L" : "M"}${x(g).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(lastGen).toFixed(1)},${H - M.bottom}L${x(0).toFixed(1)},${H - M.bottom}Z`;
  const ticks = Array.from({ length: 4 }, (_, i) => y0 + ((y1 - y0) * (i + 0.5)) / 4);
  const [lg, lv] = history[history.length - 1];

  return (
    <svg
      className="tsp-chart"
      data-testid="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`世代ごとの最短距離。世代 ${lastGen} で ${lv.toFixed(3)}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--tsp-line)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--tsp-line)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t} className="tsp-axis">
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
          <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
            {t.toFixed(2)}
          </text>
        </g>
      ))}
      <g className="tsp-axis">
        <text x={M.left} y={H - 8}>0</text>
        <text x={W - M.right} y={H - 8} textAnchor="end">
          {lastGen.toLocaleString()} 世代
        </text>
      </g>
      {optimum !== undefined && (
        <g className="tsp-optimum">
          <line x1={M.left} x2={W - M.right} y1={y(optimum)} y2={y(optimum)} />
          {/* 曲線は左ほど高いので、ラベルは左に置く（右に置くと、収束した線と重なる） */}
          <text x={M.left + 6} y={y(optimum) - 6}>
            理論上の最短 {optimum.toFixed(3)}
          </text>
        </g>
      )}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} className="tsp-line" />
      <circle cx={x(lg)} cy={y(lv)} r={4} className="tsp-dot" />
    </svg>
  );
}
