// 遺伝的操作。どれも新しい配列を返し、親を書き換えない
import { randomInt, twoDistinct, type Rng } from "./rng";

export type Route = number[];

/** 0〜n-1 を並べ替えた、でたらめな巡回路（Fisher–Yates） */
export function randomRoute(n: number, rng: Rng): Route {
  const r = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * 順序交叉（OX）。子は p1 の区間 [a, b) をそのまま受け継ぎ、残りの位置を、
 * p2 を b から1周たどった順で、区間に無い都市から埋める
 */
export function orderCrossover(p1: readonly number[], p2: readonly number[], a: number, b: number): Route {
  const n = p1.length;
  const child = new Array<number>(n);
  const used = new Uint8Array(n);
  for (let i = a; i < b; i++) {
    child[i] = p1[i];
    used[p1[i]] = 1;
  }
  let pos = b % n;
  for (let k = 0; k < n; k++) {
    const v = p2[(b + k) % n];
    if (used[v]) continue;
    child[pos] = v;
    pos = (pos + 1) % n;
  }
  return child;
}

/** 2つの親から、同じ区間で役割を入れ替えた子を2つ作る */
export function crossoverPair(p1: readonly number[], p2: readonly number[], rng: Rng): [Route, Route] {
  const [a, b] = twoDistinct(rng, p1.length + 1); // 区間の端は 0〜n（b = n で末尾まで）
  return [orderCrossover(p1, p2, a, b), orderCrossover(p2, p1, a, b)];
}

/** 2-opt 変異。区間 [a, b) を逆順にする（巡回路の2本の辺をつなぎ替えることに当たる） */
export function reverseSegment(route: readonly number[], a: number, b: number): Route {
  const r = route.slice();
  for (let i = a, j = b - 1; i < j; i++, j--) [r[i], r[j]] = [r[j], r[i]];
  return r;
}

/** 確率 rate で 2-opt 変異をかける */
export function mutate(route: readonly number[], rate: number, rng: Rng): Route {
  if (rng() >= rate) return route.slice();
  const [a, b] = twoDistinct(rng, route.length + 1);
  return reverseSegment(route, a, b);
}

/**
 * トーナメント選択。size 個を重複ありで抜き出し、いちばん短いものの番号を返す
 * （元の実装と同じく、同じ個体が2回選ばれてもよい）
 */
export function tournamentSelect(lengths: ArrayLike<number>, size: number, rng: Rng): number {
  let best = randomInt(rng, lengths.length);
  for (let k = 1; k < size; k++) {
    const i = randomInt(rng, lengths.length);
    if (lengths[i] < lengths[best]) best = i;
  }
  return best;
}
