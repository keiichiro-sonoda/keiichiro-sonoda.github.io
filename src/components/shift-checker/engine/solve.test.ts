import { describe, expect, it } from "vitest";
import { DEFAULT_CODES_TEXT, parseCodes } from "./codes";
import { check, scoreOf } from "./check";
import { DEFAULT_NEEDS_TEXT, DEFAULT_RULES, parseNeeds, type Rules } from "./rules";
import { makeSample } from "./sample";
import { inferAttrs, Solver, toTableText, type SolveInput } from "./solve";
import { parseAssignments, parseRequests, parseTable, type Roster } from "./table";

const codes = parseCodes(DEFAULT_CODES_TEXT).table;
const sample = makeSample();
const roster = parseTable(sample.table).roster!;
const rules: Rules = { ...DEFAULT_RULES, needs: parseNeeds(DEFAULT_NEEDS_TEXT).needs, units: sample.units, koukyuBase: sample.koukyuBase };
const base: SolveInput = {
  roster,
  codes,
  rules,
  requests: parseRequests(sample.requests).requests,
  assignments: parseAssignments(sample.assignments).assignments,
  attrs: new Map(),
  mode: "fix",
  year: 2026,
  month: 11,
  seed: 1,
};

function solve(input: SolveInput, iterations: number): Solver {
  const s = new Solver(input);
  const chunk = 2000;
  for (let k = 0; k < iterations; k += chunk) s.run(chunk, k / iterations);
  return s;
}

// 案をチェッカーにかけ直した点数（差分評価が全体の評価と食い違っていないか）
function recheck(s: Solver, input: SolveInput) {
  const r: Roster = { days: s.bestGrid[0].length, staff: input.roster.staff.map((st, i) => ({ ...st, codes: s.bestGrid[i] })) };
  return scoreOf(check(r, input.codes, input.rules, input.requests, input.assignments).issues);
}

describe("使える記号を表から読む", () => {
  it("その人が使った記号に、休みと（夜勤に入る人は）明けを足す。休暇は入れない", () => {
    const r: Roster = {
      days: 4,
      staff: [
        { id: "1", unit: "A", role: "", codes: ["日", "日", "有", "日"] },
        { id: "2", unit: "A", role: "", codes: ["夜", "休", "早", "遅"] },
      ],
    };
    const a = inferAttrs(r, codes, 1);
    expect(a.get("1")?.codes).toEqual(["日", "休"]);
    expect(a.get("2")?.codes).toEqual(["夜", "休", "早", "遅", "明"]);
  });
  it("公休が基準より5日以上多い人は、その日数を基準にする", () => {
    const r: Roster = { days: 4, staff: [{ id: "1", unit: "A", role: "", codes: ["休", "休", "休", "日"] }] };
    expect(inferAttrs(r, codes, 3).get("1")?.koukyu).toBeUndefined();
    expect(inferAttrs(r, codes, -2).get("1")?.koukyu).toBe(3);
  });
});

describe("修正案", () => {
  const s = solve(base, 200_000);

  it("必須の違反が消え、罰点が下がる。変えるマスは少しだけ", () => {
    expect(s.initial.score.hard).toBe(1);
    expect(s.best.score.hard).toBe(0);
    // わざと崩したのは5か所なので、高の決まりは全部直り、残っても中・低だけ
    expect(s.best.score.soft).toBeLessThan(100);
    expect(s.best.changed).toBeGreaterThan(0);
    expect(s.best.changed).toBeLessThanOrEqual(12);
  });
  it("休暇など、自動で置かない記号のマスは動かさない", () => {
    const withLeave: SolveInput = {
      ...base,
      roster: { ...roster, staff: roster.staff.map((st) => (st.id === "N2" ? { ...st, codes: st.codes.map((c, d) => (d === 25 ? "有" : c)) } : st)) },
    };
    const n2 = roster.staff.findIndex((st) => st.id === "N2");
    expect(solve(withLeave, 20_000).bestGrid[n2][25]).toBe("有");
  });
  it("差分で数えた点数が、チェッカーにかけ直した点数と同じ", () => {
    expect(recheck(s, base)).toEqual(s.best.score);
  });
  it("同じ種なら同じ案になる", () => {
    expect(solve(base, 5_000).bestGrid).toEqual(solve(base, 5_000).bestGrid);
  });
});

describe("0 から組む", () => {
  // 11月の架空の表を手本に、12月（31日）を組む。希望休は12月のもの
  const input: SolveInput = { ...base, mode: "generate", year: 2026, month: 12, requests: parseRequests("A1: 5, 6\nB2: 24!, 25!").requests };
  const s = solve(input, 150_000);

  it("必須の違反が無い表ができる", () => {
    expect(s.bestGrid[0]).toHaveLength(31);
    expect(s.best.score.hard).toBe(0);
  });
  it("必須の希望休は叶う", () => {
    const b2 = roster.staff.findIndex((st) => st.id === "B2");
    expect([s.bestGrid[b2][23], s.bestGrid[b2][24]]).toEqual(["休", "休"]);
  });
  it("使える記号の外は置かない（補助は日勤と休みだけ）", () => {
    const a8 = roster.staff.findIndex((st) => st.id === "A8");
    expect(new Set(s.bestGrid[a8])).toEqual(new Set(["日", "休"]));
  });
  it("手本の表の月末が夜勤なら、1日は明けのまま", () => {
    const ends = roster.staff.findIndex((st) => st.codes[29] === "夜");
    expect(ends).toBeGreaterThanOrEqual(0);
    expect(s.bestGrid[ends][0]).toBe("明");
  });
  it("チェッカーにかけ直しても必須の違反が無い（罰点は、夜勤の回数の目安を手本の表から取る分だけずれうる）", () => {
    expect(recheck(s, input).hard).toBe(0);
  });
});

describe("表の書き出し", () => {
  it("見出し付きのタブ区切りにし、読み直すと同じになる", () => {
    const text = toTableText(roster);
    expect(parseTable(text).roster?.staff.map((st) => st.codes)).toEqual(roster.staff.map((st) => st.codes));
  });
});
