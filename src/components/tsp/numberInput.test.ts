import { describe, expect, it } from "vitest";
import { commitDraft, nudge, snap, type NumberSpec } from "./numberInput";

const count: NumberSpec = { min: 10, max: 500, step: 1 };
const percent: NumberSpec = { min: 0, max: 100, step: 1 };
const fine: NumberSpec = { min: 0.1, max: 0.9, step: 0.05 };

describe("commitDraft", () => {
  it("範囲の中の整数はそのまま", () => {
    expect(commitDraft("84", count)).toBe(84);
  });
  it("範囲の外は端に寄せる", () => {
    expect(commitDraft("3", count)).toBe(10);
    expect(commitDraft("9999", count)).toBe(500);
    expect(commitDraft("-5", percent)).toBe(0);
  });
  it("刻みに丸める（整数の欄に小数を入れても整数になる）", () => {
    expect(commitDraft("84.6", count)).toBe(85);
    expect(commitDraft("0.33", fine)).toBe(0.35);
  });
  it("前後の空白と桁区切りのカンマを許す", () => {
    expect(commitDraft("  1,000 ", { min: 0, max: 5000, step: 1 })).toBe(1000);
  });
  it("数として読めなければ null（元の値に戻す）", () => {
    expect(commitDraft("", count)).toBeNull();
    expect(commitDraft("   ", count)).toBeNull();
    expect(commitDraft("abc", count)).toBeNull();
    expect(commitDraft("1e999", count)).toBeNull();
  });
});

describe("nudge", () => {
  it("刻みひとつぶん上下する", () => {
    expect(nudge(84, 1, count)).toBe(85);
    expect(nudge(84, -1, count)).toBe(83);
  });
  it("big なら10刻みぶん", () => {
    expect(nudge(84, 1, count, true)).toBe(94);
  });
  it("端を越えない", () => {
    expect(nudge(500, 1, count)).toBe(500);
    expect(nudge(10, -1, count, true)).toBe(10);
  });
  it("小数の刻みでも、丸めの誤差が出ない", () => {
    let v = 0.1;
    for (let i = 0; i < 4; i++) v = nudge(v, 1, fine);
    expect(v).toBe(0.3);
  });
});

describe("snap", () => {
  it("刻みで割り切れない最大値は、最大値で止める", () => {
    expect(snap(1000, { min: 10, max: 995, step: 10 })).toBe(995);
  });
});
