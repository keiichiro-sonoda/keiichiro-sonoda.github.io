import { describe, expect, it } from "vitest";
import { DEFAULT_CODES_TEXT, parseCodes } from "./codes";
import { DEFAULT_NEEDS_TEXT, parseNeeds } from "./rules";
import { daysInMonth, weekday } from "./sample";
import { parseAssignments, parseRequests, parseTable } from "./table";

const days = (n: number) => Array.from({ length: n }, (_, d) => String(d + 1));

describe("勤務表の読み込み", () => {
  it("タブ区切り。ほかの列は読まず、職種は任意", () => {
    const text = [["番号", "ユニット", ...days(28), "公休"], ["1", "A", ...Array(28).fill("休"), "28"]]
      .map((r) => r.join("\t"))
      .join("\n");
    const { roster, errors } = parseTable(text);
    expect(errors).toEqual([]);
    expect(roster).toMatchObject({ days: 28, staff: [{ id: "1", unit: "A", role: "" }] });
    expect(roster!.staff[0].codes).toHaveLength(28);
  });
  it("CSV と「1日」の見出しも読む。足りないマスは空", () => {
    const text = `名前,職種,ユニット,${days(30).map((d) => `${d}日`).join(",")}\nX,看護師,B,休,休`;
    const { roster } = parseTable(text);
    expect(roster!.days).toBe(30);
    expect(roster!.staff[0].codes.slice(0, 3)).toEqual(["休", "休", ""]);
  });
  it("見出しが足りないと読まない", () => {
    expect(parseTable("").errors).toEqual(["表が空"]);
    expect(parseTable("a\tb\n1\t2").errors).toHaveLength(3);
  });
  it("番号の空・重複と、職員の行が無いのを挙げる", () => {
    const head = ["番号", "ユニット", ...days(28)].join("\t");
    expect(parseTable(head).errors).toEqual(["職員の行がない"]);
    expect(parseTable(`${head}\n1\tA\n1\tA\n\tA`).errors).toEqual(["3行目: 番号「1」が2回出てくる", "4行目: 番号が空"]);
  });
});

describe("記号の表と人数の決まり", () => {
  it("既定の表は読める", () => {
    expect(parseCodes(DEFAULT_CODES_TEXT).errors).toEqual([]);
    expect(parseCodes(DEFAULT_CODES_TEXT).table.get("リ")).toEqual({ code: "リ", kind: "日勤", tags: ["リーダー"] });
    expect(parseNeeds(DEFAULT_NEEDS_TEXT).errors).toEqual([]);
    expect(parseNeeds(DEFAULT_NEEDS_TEXT).needs.at(-1)).toEqual({ scope: "facility", target: "夜勤", min: 1, role: "看護" });
  });
  it("書き間違いを行番号つきで挙げる", () => {
    expect(parseCodes("休 公休\n休 公休\nX 何か").errors).toEqual([
      "記号の表 2行目: 「休」が2回出てくる",
      expect.stringContaining("記号の表 3行目: 「何か」は種類にない"),
    ]);
    expect(parseNeeds("毎日 早 1\n各ユニット 早\n全体 早 -1").errors).toHaveLength(3);
  });
});

describe("希望休", () => {
  it("区切りは , 、 空白のどれでもよい", () => {
    expect(parseRequests("A1: 3, 15、22 29日\nB：1").requests).toEqual([
      { id: "A1", day: 3 },
      { id: "A1", day: 15 },
      { id: "A1", day: 22 },
      { id: "A1", day: 29 },
      { id: "B", day: 1 },
    ]);
  });
  it("読めない行と日付", () => {
    expect(parseRequests("A1 3\nA2: 32, x").errors).toHaveLength(3);
  });
});

describe("数え先", () => {
  it("ユニットだけならふだんの数え先、日付があればその日だけ", () => {
    expect(parseAssignments("S1: B\nS1：3、4日 A # 応援").assignments).toEqual([
      { id: "S1", unit: "B" },
      { id: "S1", unit: "A", day: 3 },
      { id: "S1", unit: "A", day: 4 },
    ]);
  });
  it("読めない行と日付", () => {
    // 区切りが無い・ユニットが無い・ユニットが日付・日付が2つ読めない
    expect(parseAssignments("S1 B\nS1:\nS1: 3\nS1: x 32 A").errors).toHaveLength(5);
  });
});

describe("暦", () => {
  it("月の日数と曜日", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 11)).toBe(30);
    expect(weekday(2026, 11, 1)).toBe(0);
  });
});
