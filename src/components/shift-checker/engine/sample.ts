// 試すための架空の勤務表。決まりどおりに回る並びを作り、わざと少しだけ崩す
// （実在の勤務表は使わない。人も職場も架空）

export const SAMPLE_YEAR = 2026;
export const SAMPLE_MONTH = 11;

// 7人で回す「日勤リーダー → 夜勤 → 明け → 休み → 早番 → 遅番 → 休み」。毎日、各位置に1人ずつ入る
const UNIT_CYCLE = ["リ", "夜", "明", "休", "早", "遅", "休"];
// 看護師6人で、施設全体の夜勤看護師を毎晩1人
const NURSE_CYCLE = ["日", "夜", "明", "休", "日", "休"];

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// 0 が日曜
export function weekday(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

interface Row {
  id: string;
  role: string;
  unit: string;
  codes: string[];
}

// from 日目以降で、最初に code になる日の添字
function firstAt(row: Row, code: string, from: number): number {
  const i = row.codes.indexOf(code, from);
  if (i < 0) throw new Error(`${row.id} に ${code} がない`);
  return i;
}

export interface Sample {
  table: string;
  requests: string;
  assignments: string;
  // 7人で回す並びは30日で公休が8〜9日になるので、基準は9日
  koukyuBase: number;
  units: string[];
}

export function makeSample(): Sample {
  const days = daysInMonth(SAMPLE_YEAR, SAMPLE_MONTH);
  const rows: Row[] = [];
  for (const unit of ["A", "B"]) {
    for (let i = 0; i < UNIT_CYCLE.length; i++) {
      rows.push({
        id: `${unit}${i + 1}`,
        role: "介護員",
        unit,
        codes: Array.from({ length: days }, (_, d) => UNIT_CYCLE[(d + i) % UNIT_CYCLE.length]),
      });
    }
    // 平日だけの日勤
    rows.push({
      id: `${unit}${UNIT_CYCLE.length + 1}`,
      role: "介護員補助",
      unit,
      codes: Array.from({ length: days }, (_, d) => {
        const w = weekday(SAMPLE_YEAR, SAMPLE_MONTH, d + 1);
        return w === 0 || w === 6 ? "休" : "日";
      }),
    });
  }
  // ユニットに属さない主任。ふだんは B に数える、平日だけの日勤
  rows.push({
    id: "S1",
    role: "主任介護員",
    unit: "フロア",
    codes: Array.from({ length: days }, (_, d) => {
      const w = weekday(SAMPLE_YEAR, SAMPLE_MONTH, d + 1);
      return w === 0 || w === 6 ? "休" : "日";
    }),
  });
  for (let i = 0; i < NURSE_CYCLE.length; i++) {
    rows.push({
      id: `N${i + 1}`,
      role: "看護師",
      unit: "看護",
      codes: Array.from({ length: days }, (_, d) => NURSE_CYCLE[(d + i) % NURSE_CYCLE.length]),
    });
  }
  const row = (id: string) => rows.find((r) => r.id === id)!;

  // わざと崩す
  // A3: 明けの翌日の休みを早番に
  const a3 = row("A3");
  a3.codes[firstAt(a3, "明", 8) + 1] = "早";
  // A5: 遅番と長日勤の間の休みを日勤にして、6日続けて勤務
  const a5 = row("A5");
  a5.codes[firstAt(a5, "遅", 12) + 1] = "日";
  // B2: 遅番を休みに（その日の B は遅番がいない）
  const b2 = row("B2");
  b2.codes[firstAt(b2, "遅", 18)] = "休";
  // N2: 明けを日勤に
  const n2 = row("N2");
  n2.codes[firstAt(n2, "明", 20)] = "日";
  // 後半の平日に A の早番を休みにして、S1 がその日だけ A の早番に入る。数え先は B のままなので、応援で埋まる不足になる
  // （A3 を崩して A の早番が2人になった日は避ける）
  const s1 = row("S1");
  const early = (d: number) => rows.filter((r) => r.unit === "A" && r.codes[d] === "早");
  const helped = s1.codes.findIndex((c, d) => d >= 22 && c === "日" && early(d).length === 1);
  if (helped < 0) throw new Error("S1 が応援に入れる日がない");
  early(helped)[0].codes[helped] = "休";
  s1.codes[helped] = "早";

  // 希望休。A1 は1日だけ叶っていない
  const a1 = row("A1");
  const b4 = row("B4");
  const restDays = (r: Row, from: number, n: number) =>
    r.codes.flatMap((c, d) => (d >= from && c === "休" ? [d + 1] : [])).slice(0, n);
  const requests = [
    `A1: ${[...restDays(a1, 2, 2), firstAt(a1, "早", 14) + 1].join(", ")}`,
    `B4: ${restDays(b4, 5, 3).join(", ")}`,
  ].join("\n");

  const header = ["番号", "職種", "ユニット", ...Array.from({ length: days }, (_, d) => String(d + 1)), "公休"];
  const lines = rows.map((r) => [r.id, r.role, r.unit, ...r.codes, String(r.codes.filter((c) => c === "休").length)]);
  return {
    table: [header, ...lines].map((cells) => cells.join("\t")).join("\n"),
    requests,
    assignments: "S1: B",
    koukyuBase: 9,
    units: ["A", "B"],
  };
}
