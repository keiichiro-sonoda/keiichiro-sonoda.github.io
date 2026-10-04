import { describe, expect, it } from "vitest";
import { isPermutation } from "./distance";
import { crossoverPair, mutate, orderCrossover, randomRoute, reverseSegment, tournamentSelect } from "./operators";
import { createRng, type Rng } from "./rng";

/** 決まった値を順に返す乱数（選ばれる位置をテストで固定するため） */
function fixed(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("randomRoute", () => {
  it("順列を返し、シードで決まる", () => {
    const r = randomRoute(50, createRng(1));
    expect(isPermutation(r, 50)).toBe(true);
    expect(r).toEqual(randomRoute(50, createRng(1)));
    expect(r).not.toEqual(Array.from({ length: 50 }, (_, i) => i));
  });
});

describe("orderCrossover", () => {
  const p1 = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const p2 = [8, 2, 6, 7, 1, 5, 4, 0, 3];

  it("区間は p1 から受け継ぎ、残りは p2 を区間の後ろから1周たどった順で埋める", () => {
    // 区間 [3, 6) = 3,4,5。p2 を位置6から: 4,0,3,8,2,6,7,1,5 → 区間に無いもの: 0,8,2,6,7,1
    // 埋める位置は 6,7,8,0,1,2
    expect(orderCrossover(p1, p2, 3, 6)).toEqual([6, 7, 1, 3, 4, 5, 0, 8, 2]);
  });

  it("区間が全体なら p1 そのもの、空なら p2 の並びを b から回したもの", () => {
    expect(orderCrossover(p1, p2, 0, 9)).toEqual(p1);
    expect(orderCrossover(p1, p2, 0, 0)).toEqual(p2);
  });

  it("どんな区間・どんな親でも、子は順列になる（性質のテスト）", () => {
    const rng = createRng(123);
    for (let t = 0; t < 500; t++) {
      const n = 3 + Math.floor(rng() * 40);
      const a1 = randomRoute(n, rng);
      const a2 = randomRoute(n, rng);
      const [c1, c2] = crossoverPair(a1, a2, rng);
      expect(isPermutation(c1, n)).toBe(true);
      expect(isPermutation(c2, n)).toBe(true);
    }
  });

  it("親を書き換えない", () => {
    const a = p1.slice();
    const b = p2.slice();
    crossoverPair(a, b, createRng(1));
    expect(a).toEqual(p1);
    expect(b).toEqual(p2);
  });
});

describe("reverseSegment / mutate", () => {
  it("区間 [a, b) を逆順にする", () => {
    expect(reverseSegment([0, 1, 2, 3, 4, 5], 1, 4)).toEqual([0, 3, 2, 1, 4, 5]);
    expect(reverseSegment([0, 1, 2], 0, 3)).toEqual([2, 1, 0]);
    expect(reverseSegment([0, 1, 2], 1, 2)).toEqual([0, 1, 2]);
  });

  it("確率に当たらなければ、写しをそのまま返す", () => {
    const r = [0, 1, 2, 3];
    const out = mutate(r, 0.5, fixed(0.9));
    expect(out).toEqual(r);
    expect(out).not.toBe(r);
  });

  it("確率に当たれば、どこかの区間を逆順にする（rate = 1 なら必ず）", () => {
    // 1つ目の乱数で当たり判定、続く2つで区間を選ぶ: [0, 5) の候補から a = floor(0.2*5) = 1, b = floor(0.7*4) = 2 → 2 >= 1 なので 3
    expect(mutate([0, 1, 2, 3], 1, fixed(0, 0.2, 0.7))).toEqual([0, 2, 1, 3]);
  });

  it("変異のあとも順列のまま（性質のテスト）", () => {
    const rng = createRng(77);
    for (let t = 0; t < 500; t++) {
      const n = 3 + Math.floor(rng() * 40);
      expect(isPermutation(mutate(randomRoute(n, rng), 1, rng), n)).toBe(true);
    }
  });
});

describe("tournamentSelect", () => {
  const lengths = [5, 1, 9, 3];
  it("抜き出したうち、いちばん短いものを選ぶ", () => {
    // 位置 0, 2, 3 を抜き出す → 長さ 5, 9, 3 → 位置 3
    expect(tournamentSelect(lengths, 3, fixed(0, 0.5, 0.75))).toBe(3);
  });
  it("大きさ 1 なら、抜き出した1つをそのまま返す", () => {
    expect(tournamentSelect(lengths, 1, fixed(0.5))).toBe(2);
  });
  it("大きさを大きくするほど、短い個体が選ばれやすい", () => {
    const rng = createRng(4);
    const count = (size: number) => {
      let hits = 0;
      for (let i = 0; i < 2000; i++) if (tournamentSelect(lengths, size, rng) === 1) hits++;
      return hits;
    };
    expect(count(5)).toBeGreaterThan(count(1));
  });
});
