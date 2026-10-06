// 数値の入力欄の、確定と矢印キーの計算（画面から切り離して単体テストする）。値はすべて表示の単位（% なら 0〜100）
export interface NumberSpec {
  min: number;
  max: number;
  /** 刻み。入力した値はこの刻みに丸める */
  step: number;
}

/** 刻みの小数点以下の桁数（0.05 なら 2）。丸めの誤差（0.1 + 0.2 など）を消すのに使う */
function decimals(step: number): number {
  const s = String(step);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

/** 範囲に収め、min を起点に刻みへ丸める */
export function snap(v: number, spec: NumberSpec): number {
  const clamped = Math.min(spec.max, Math.max(spec.min, v));
  const k = Math.round((clamped - spec.min) / spec.step);
  const snapped = Math.min(spec.max, spec.min + k * spec.step);
  return Number(snapped.toFixed(decimals(spec.step)));
}

/** 入力欄の文字を確定する。数として読めなければ null（元の値に戻す） */
export function commitDraft(draft: string, spec: NumberSpec): number | null {
  const t = draft.trim().replace(/[,\s]/g, "");
  if (t === "") return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return snap(v, spec);
}

/** 矢印キー1回ぶん動かす。big（Shift）なら10刻みぶん */
export function nudge(current: number, direction: 1 | -1, spec: NumberSpec, big = false): number {
  return snap(current + direction * spec.step * (big ? 10 : 1), spec);
}
