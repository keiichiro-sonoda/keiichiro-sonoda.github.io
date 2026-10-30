import { describe, expect, it } from "vitest";
import { DEFAULT_CODES_TEXT, parseCodes } from "./codes";
import { check, type Issue } from "./check";
import { DEFAULT_NEEDS_TEXT, DEFAULT_RULES, parseNeeds, type Rules } from "./rules";
import { makeSample } from "./sample";
import { parseAssignments, parseRequests, parseTable, type Roster } from "./table";

const codes = parseCodes(DEFAULT_CODES_TEXT).table;
const rules = (patch: Partial<Rules> = {}): Rules => ({
  ...DEFAULT_RULES,
  needs: parseNeeds(DEFAULT_NEEDS_TEXT).needs,
  ...patch,
});

// 1人分の並びを、人数の決まり無しで調べる
function one(line: string, patch: Partial<Rules> = {}): Issue[] {
  const roster: Roster = { days: line.split(" ").length, staff: [{ id: "X", unit: "A", role: "", codes: line.split(" ") }] };
  return check(roster, codes, rules({ needs: [], ...patch })).issues;
}
const rulesOf = (issues: Issue[]) => issues.map((i) => `${i.rule}@${i.day}`);

describe("一人ひとりの並び", () => {
  it("定番の並びは何も挙がらない", () => {
    expect(one("長 夜 明 休 早 遅 休 リ 夜 明 休")).toEqual([]);
  });
  it("夜勤の翌日が明けでない", () => {
    expect(rulesOf(one("長 夜 休 休"))).toEqual(["夜勤の翌日@3"]);
  });
  it("月末の夜勤は翌日を見ない", () => {
    expect(one("休 休 長 夜")).toEqual([]);
  });
  it("明けの前日が夜勤でない。1日目の明けは前月の夜勤とみなす", () => {
    expect(rulesOf(one("明 休 日 明 休"))).toEqual(["明けの前日@4"]);
  });
  it("明けの翌日が休みでない（有休なら休み扱い）", () => {
    expect(rulesOf(one("長 夜 明 早 休"))).toEqual(["明けの翌日@4"]);
    expect(one("長 夜 明 有 休")).toEqual([]);
  });
  it("連続勤務は上限を超えた日に1回だけ挙げる", () => {
    const issues = one("日 日 日 日 日 日 日 休", { maxConsecutive: 5 });
    expect(rulesOf(issues)).toEqual(["連続勤務@6"]);
  });
  it("夜勤の間隔が短い", () => {
    expect(rulesOf(one("夜 明 夜 明 休", { minNightGap: 3, beforeNightTag: "" }))).toEqual(["明けの翌日@3", "夜勤の間隔@3"]);
  });
  it("夜勤の前日によい札を決めると、その札でも休みでもない日を参考に挙げる。既定は空で見ない", () => {
    expect(rulesOf(one("早 夜 明 休", { beforeNightTag: "長" }))).toEqual(["夜勤の前日@1"]);
    expect(one("長 夜 明 休", { beforeNightTag: "長" })).toEqual([]);
    expect(one("休 夜 明 休", { beforeNightTag: "長" })).toEqual([]);
    expect(one("早 夜 明 休")).toEqual([]);
  });
  it("知らない記号と空のマス", () => {
    expect(one("休 ？ 休").map((i) => [i.severity, i.rule])).toEqual([["違反", "知らない記号"]]);
    // 区切りの空白が2つ続くところが空のマス
    expect(one("休  休").map((i) => i.rule)).toEqual(["空のマス"]);
  });
});

describe("人数と希望休", () => {
  const roster: Roster = {
    days: 2,
    staff: [
      { id: "1", unit: "A", role: "看護師", codes: ["夜", "明"] },
      { id: "2", unit: "A", role: "介護員", codes: ["夜", "明"] },
      { id: "3", unit: "B", role: "介護員", codes: ["休", "夜"] },
    ],
  };
  const needs = parseNeeds("各ユニット 夜勤 1 介護\n全体 夜勤 1 看護").needs;

  it("ユニットごとと全体で数え、足りない日を挙げる", () => {
    const r = check(roster, codes, rules({ needs }));
    expect(r.coverage.map((c) => [c.unit ?? "全体", c.counts])).toEqual([
      ["A", [1, 0]],
      ["B", [0, 1]],
      ["全体", [1, 0]],
    ]);
    expect(r.issues.filter((i) => i.rule === "人数").map((i) => i.message)).toEqual([
      "2日 ユニット A の 夜勤（介護） が 0人（1人必要）",
      "1日 ユニット B の 夜勤（介護） が 0人（1人必要）",
      "2日 全体 の 夜勤（看護） が 0人（1人必要）",
    ]);
  });
  it("見るユニットを絞れる", () => {
    const r = check(roster, codes, rules({ needs, units: ["A"] }));
    expect(r.coverage.map((c) => c.unit ?? "全体")).toEqual(["A", "全体"]);
  });
  it("希望休の叶った数と、表にいない人", () => {
    const { requests } = parseRequests("3: 1, 2\n9: 1");
    const r = check(roster, codes, rules({ needs: [] }), requests);
    expect(r.summaries[2]).toMatchObject({ requested: 2, granted: 1 });
    expect(r.issues.filter((i) => i.rule === "希望休").map((i) => i.severity)).toEqual(["違反", "注意"]);
  });
});

describe("ユニット外の人の数え先", () => {
  // S1 はユニットに属さない。2日目に A の遅番が抜け、S1 が遅番に入っている
  const roster: Roster = {
    days: 2,
    staff: [
      { id: "a", unit: "A", role: "", codes: ["遅", "休"] },
      { id: "b", unit: "B", role: "", codes: ["休", "遅"] },
      { id: "S1", unit: "フロア", role: "", codes: ["遅", "遅"] },
    ],
  };
  const needs = parseNeeds("各ユニット 遅 1").needs;
  const run = (text: string, units: string[] = ["A", "B"]) => check(roster, codes, rules({ needs, units }), [], parseAssignments(text).assignments);
  const short = (issues: Issue[]) => issues.filter((i) => i.rule === "人数").map((i) => `${i.severity} ${i.day}日 ${i.unit}`);

  it("ふだんの数え先に数える", () => {
    const r = run("S1: B");
    expect(r.coverage.map((c) => [c.unit, c.counts])).toEqual([
      ["A", [1, 0]],
      ["B", [1, 2]],
    ]);
    expect(r.summaries[2].unit).toBe("B");
  });
  it("ほかのユニットに数えた人が余っていれば、不足は注意にとどめる", () => {
    const r = run("S1: B");
    expect(short(r.issues)).toEqual(["注意 2日 A"]);
    expect(r.issues.find((i) => i.rule === "人数")?.message).toBe(
      "2日 ユニット A の 遅 が 0人（1人必要）。ユニット外の S1 が遅に入っているので、応援なら足りる",
    );
  });
  it("その日だけの数え先を書けば、不足は消える", () => {
    expect(short(run("S1: B\nS1: 2日 A").issues)).toEqual([]);
  });
  it("数えた先でもその人が要るなら、違反のまま", () => {
    const solo: Roster = { ...roster, staff: [roster.staff[0], { ...roster.staff[2], codes: ["休", "遅"] }] };
    const r = check(solo, codes, rules({ needs, units: ["A", "B"] }), [], parseAssignments("S1: B").assignments);
    expect(short(r.issues)).toEqual(["違反 2日 A", "違反 1日 B"]);
  });
  it("数え先を書かず見るユニットも決めないと、所属がそのままユニットになる", () => {
    expect(run("", []).coverage.map((c) => c.unit)).toEqual(["A", "B", "フロア"]);
    expect(run("S1: B", []).coverage.map((c) => c.unit)).toEqual(["A", "B"]);
  });
  it("表にいない人は注意", () => {
    expect(run("99: B").issues.filter((i) => i.rule === "数え先").map((i) => i.severity)).toEqual(["注意"]);
  });
});

describe("架空の勤務表", () => {
  const sample = makeSample();
  const { roster } = parseTable(sample.table);
  const r = check(
    roster!,
    codes,
    rules({ units: sample.units }),
    parseRequests(sample.requests).requests,
    parseAssignments(sample.assignments).assignments,
  );

  it("わざと崩したところだけが違反・注意になる", () => {
    const found = r.issues.filter((i) => i.severity !== "参考").map((i) => `${i.severity} ${i.rule} ${i.staffId ?? i.unit}`);
    expect(found.sort()).toEqual(
      // A3 は明けの翌日を勤務にしたので、続けて6日の勤務にもなる。A の早番の不足は S1 の応援で埋まる
      [
        "注意 明けの翌日 A3",
        "違反 連続勤務 A3",
        "違反 連続勤務 A5",
        "違反 人数 B",
        "違反 夜勤の翌日 N2",
        "違反 希望休 A1",
        "注意 人数 A",
      ].sort(),
    );
    expect(r.issues.find((i) => i.rule === "人数" && i.unit === "A")?.message).toMatch(/ユニット外の S1 が早に入っているので、応援なら足りる$/);
  });
  it("集計", () => {
    const a1 = r.summaries.find((s) => s.id === "A1")!;
    expect(a1).toMatchObject({ requested: 3, granted: 2, maxRun: 3 });
    expect(a1.nights).toBeGreaterThanOrEqual(4);
    expect(a1.leader).toBe(a1.nights);
  });
});
