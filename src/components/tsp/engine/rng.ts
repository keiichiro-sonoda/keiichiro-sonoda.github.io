// シード付きの乱数。同じシードなら同じ点の配置・同じ進化になる（テストと「同じ条件でやり直す」のため）
export type Rng = () => number;

/** mulberry32。[0, 1) の一様乱数を返す関数を作る */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [0, n) の整数 */
export function randomInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/**
 * [0, n) から異なる2つを選び、小さい順に返す。
 * 元の実装は `[a, b].sort()` で数値を文字列として並べ（[10, 9] が並び替わらない）、
 * 区間が逆向きになって交叉と変異が空振りしていた。ここでは数値で比べる
 */
export function twoDistinct(rng: Rng, n: number): [number, number] {
  if (n < 2) throw new RangeError(`2つ選ぶには n >= 2 が要る（n = ${n}）`);
  const a = randomInt(rng, n);
  let b = randomInt(rng, n - 1);
  if (b >= a) b += 1;
  return a < b ? [a, b] : [b, a];
}

/** 画面で表示・入力するシード（32ビットの符号なし整数） */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}
