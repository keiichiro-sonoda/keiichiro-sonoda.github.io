import { describe, expect, it } from "vitest";
import { DEFAULT_CODES_TEXT, parseCodes } from "./codes";
import { check, type Issue } from "./check";
import { DEFAULT_LEVELS, DEFAULT_NEEDS_TEXT, DEFAULT_RULES, parseNeeds, type Rules } from "./rules";
import { makeSample } from "./sample";
import { parseAssignments, parseRequests, parseTable, type Roster } from "./table";

const codes = parseCodes(DEFAULT_CODES_TEXT).table;
const rules = (patch: Partial<Rules> = {}): Rules => ({
  ...DEFAULT_RULES,
  needs: parseNeeds(DEFAULT_NEEDS_TEXT).needs,
  ...patch,
});

// 1人分の並びを、人数と月単位の決まり無しで調べる
const quiet = { ...DEFAULT_LEVELS, 公休の日数: "見ない", 夜勤の回数: "見ない" } as const;
function one(line: string, patch: Partial<Rules> = {}): Issue[] {
  const roster: Roster = { days: line.split(" ").length, staff: [{ id: "X", unit: "A", role: "", codes: line.split(" ") }] };
  return check(roster, codes, rules({ needs: [], levels: quiet, ...patch })).issues;
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
  it("連続勤務は上限を超えた日に1回だけ挙げ、罰点は超えた日数の分", () => {
    const issues = one("日 日 日 日 日 日 日 休", { maxConsecutive: 5 });
    expect(rulesOf(issues)).toEqual(["連続勤務@6"]);
    expect(issues[0]).toMatchObject({ severity: "注意", level: "高", weight: 200 });
    // 月末まで続いても数える
    expect(rulesOf(one("休 日 日 日 日 日 日", { maxConsecutive: 5 }))).toEqual(["連続勤務@7"]);
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
    expect(one("休  休").map((i) => i.severity)).toEqual(["注意"]);
    // 区切りの空白が2つ続くところが空のマス
    expect(one("休  休").map((i) => i.rule)).toEqual(["空のマス"]);
  });
  it("重みを「見ない」にした決まりは挙げない", () => {
    expect(one("長 夜 休 休", { levels: { ...quiet, 夜勤の翌日: "見ない" } })).toEqual([]);
  });
});

describe("月単位の決まり", () => {
  const month = (line: string, base = 10) => {
    const row = line.split(" ");
    const roster: Roster = {
      days: row.length,
      staff: [
        { id: "X", unit: "A", role: "", codes: row },
        { id: "Y", unit: "A", role: "", codes: row.map(() => "休") },
      ],
    };
    return check(roster, codes, rules({ needs: [], koukyuBase: base })).issues.filter((i) => i.staffId === "X");
  };
  it("公休は基準から ±1 日ならよく、超えた日数の分だけ罰点", () => {
    expect(month("休 休 日 日", 3)).toEqual([]);
    expect(month("休 日 日 日", 4)).toEqual([expect.objectContaining({ rule: "公休の日数", level: "中", weight: 20 })]);
  });
})

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
    // 日ごとに、ユニット・全体の順
    expect(r.issues.filter((i) => i.rule === "人数").map((i) => i.message)).toEqual([
      "1日 ユニット B の 夜勤（介護） が 0人（1人必要）",
      "2日 ユニット A の 夜勤（介護） が 0人（1人必要）",
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
    expect(r.issues.filter((i) => i.rule === "希望休").map((i) => i.severity)).toEqual(["注意", "注意"]);
  });
  it("叶わない希望は1人の中で2件目・3件目ほど重い。「!」の付いた希望は必須", () => {
    const two: Roster = { days: 3, staff: [{ id: "1", unit: "A", role: "", codes: ["日", "日", "日"] }] };
    const weights = (text: string) =>
      check(two, codes, rules({ needs: [], levels: quiet }), parseRequests(text).requests).issues.map((i) => `${i.severity}${i.weight}`);
    expect(weights("1: 1, 2, 3")).toEqual(["注意100", "注意200", "注意300"]);
    expect(weights("1: 1, 2!")).toEqual(["注意100", "違反0"]);
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
  const short = (issues: Issue[]) => issues.filter((i) => i.rule === "人数").map((i) => `${i.level} ${i.day}日 ${i.unit}`);

  it("ふだんの数え先に数える", () => {
    const r = run("S1: B");
    expect(r.coverage.map((c) => [c.unit, c.counts])).toEqual([
      ["A", [1, 0]],
      ["B", [1, 2]],
    ]);
    expect(r.summaries[2].unit).toBe("B");
  });
  it("ほかのユニットに数えた人が余っていれば、不足の重みを1段軽くする", () => {
    const r = run("S1: B");
    expect(short(r.issues)).toEqual(["中 2日 A"]);
    expect(r.issues.find((i) => i.rule === "人数")?.message).toBe(
      "2日 ユニット A の 遅 が 0人（1人必要）。ユニット外の S1 が遅に入っているので、応援なら足りる",
    );
  });
  it("その日だけの数え先を書けば、不足は消える", () => {
    expect(short(run("S1: B\nS1: 2日 A").issues)).toEqual([]);
  });
  it("数えた先でもその人が要るなら、重みはそのまま", () => {
    const solo: Roster = { ...roster, staff: [roster.staff[0], { ...roster.staff[2], codes: ["休", "遅"] }] };
    const r = check(solo, codes, rules({ needs, units: ["A", "B"] }), [], parseAssignments("S1: B").assignments);
    expect(short(r.issues)).toEqual(["高 1日 B", "高 2日 A"]);
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
    rules({ units: sample.units, koukyuBase: sample.koukyuBase }),
    parseRequests(sample.requests).requests,
    parseAssignments(sample.assignments).assignments,
  );

  it("わざと崩したところだけが挙がる", () => {
    const found = r.issues.map((i) => `${i.level} ${i.rule} ${i.staffId ?? i.unit}`);
    expect(found.sort()).toEqual(
      // A3 は明けの翌日を勤務にしたので、続けて6日の勤務にもなる。A5 は休みを1日減らしたので公休も足りない。
      // A の早番の不足は S1 の応援で埋まるので、1段軽い
      [
        "必須 夜勤の翌日 N2",
        "高 明けの翌日 A3",
        "高 連続勤務 A3",
        "高 連続勤務 A5",
        "中 公休の日数 A5",
        "高 人数 B",
        "高 希望休 A1",
        "中 人数 A",
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
