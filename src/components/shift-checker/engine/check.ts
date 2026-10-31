// 勤務表を決まりに照らして、合っていないところを挙げる。画面には依存しない
// 自動で直す・組む（solve.ts）も、同じ判定を罰点として使う。判定を1か所に置き、チェッカーと生成で食い違わないようにする
import { isRest, isWork, type CodeDef, type CodeTable } from "./codes";
import { isKindName, lighter, needLabel, WEIGHT, type Level, type Need, type RuleKey, type Rules } from "./rules";
import type { Assignment, Request, Roster, Staff } from "./table";

// 違反: 必須の決まりを破っている / 注意: 高・中の決まり / 参考: 低の決まり
export type Severity = "違反" | "注意" | "参考";
export const SEVERITIES: Severity[] = ["違反", "注意", "参考"];

export function severityOf(level: Level): Severity {
  return level === "必須" ? "違反" : level === "低" ? "参考" : "注意";
}

export interface Issue {
  severity: Severity;
  level: Level;
  // 罰点（必須は数で数えるので 0）
  weight: number;
  rule: string;
  message: string;
  staffId?: string;
  // 1 始まり
  day?: number;
  unit?: string;
}

// 表の良し悪し。hard（必須の違反の数）が小さいほうが良く、同じなら soft（罰点の合計）が小さいほうが良い
export interface Score {
  hard: number;
  soft: number;
}

export function scoreOf(issues: Issue[]): Score {
  let hard = 0;
  let soft = 0;
  for (const i of issues) {
    if (i.level === "必須") hard++;
    else soft += i.weight;
  }
  return { hard, soft };
}

// 指摘の受け取り手。チェッカーは文を作って集め、生成は数だけ数える（文を作らないので速い）
export interface Sink {
  add(level: Level, weight: number, rule: string, message: () => string, where: { staffId?: string; day?: number; unit?: string }): void;
}

export class IssueSink implements Sink {
  issues: Issue[] = [];
  add(level: Level, weight: number, rule: string, message: () => string, where: { staffId?: string; day?: number; unit?: string }) {
    if (level === "見ない") return;
    this.issues.push({ severity: severityOf(level), level, weight: level === "必須" ? 0 : weight, rule, message: message(), ...where });
  }
}

export class TallySink implements Sink {
  hard = 0;
  soft = 0;
  add(level: Level, weight: number) {
    if (level === "見ない") return;
    if (level === "必須") this.hard++;
    else this.soft += weight;
  }
  reset() {
    this.hard = 0;
    this.soft = 0;
  }
}

export interface StaffSummary {
  id: string;
  // 人数を数えるユニット（ふだんの数え先）
  unit: string;
  koukyu: number;
  nights: number;
  maxRun: number;
  leader: number;
  requested: number;
  granted: number;
}

export interface Coverage {
  // 「全体」なら unit は undefined
  unit?: string;
  need: Need;
  // counts[d] が d+1 日の人数
  counts: number[];
}

export interface CheckResult {
  issues: Issue[];
  summaries: StaffSummary[];
  coverage: Coverage[];
}

// 職員ごとの設定（表に無い情報）。使える記号は自動で組むときだけ使う
export interface StaffAttr {
  codes?: string[];
  koukyu?: number;
}

// 判定に要るもののうち、マスの中身を変えても変わらないもの。生成ではこれを一度だけ作って使い回す
export interface Prepared {
  codes: CodeTable;
  rules: Rules;
  staff: Staff[];
  days: number;
  // staff と同じ並び
  requests: Request[][];
  koukyuBase: number[];
  // 夜勤の回数の目安。元の表で夜勤に入っていた人だけを見る
  nightStaff: boolean[];
  nightAverage: number;
  unitOn: (i: number, d: number) => string;
  usualUnit: string[];
  units: string[];
  checked: Set<string>;
  // 表全体に付く指摘（希望休や数え先に書いた人が表にいない、など）
  global: Issue[];
}

function matches(def: CodeDef | undefined, staff: Staff, need: Need): boolean {
  if (!def) return false;
  const hit = isKindName(need.target) ? def.kind === need.target : def.tags.includes(need.target);
  return hit && (!need.role || staff.role.includes(need.role));
}

export function prepare(
  roster: Roster,
  codes: CodeTable,
  rules: Rules,
  requests: Request[] = [],
  assignments: Assignment[] = [],
  attrs: Map<string, StaffAttr> = new Map(),
): Prepared {
  const { staff, days } = roster;
  const global: Issue[] = [];
  const byId = new Map(staff.map((s, i) => [s.id, i]));
  const note = (rule: string, message: string) => global.push({ severity: "注意", level: "中", weight: 0, rule, message });

  const perStaff: Request[][] = staff.map(() => []);
  for (const r of requests) {
    const i = byId.get(r.id);
    if (i === undefined) note("希望休", `希望休の「${r.id}」が表にいない`);
    else if (r.day <= days) perStaff[i].push(r);
  }

  // 数え先。ユニットに属さない人を、人数を数えるときにどのユニットに入れるか
  const usual = new Map<string, string>();
  const onDay = new Map<string, string>();
  for (const a of assignments) {
    if (!byId.has(a.id)) note("数え先", `数え先の「${a.id}」が表にいない`);
    else if (a.day === undefined) usual.set(a.id, a.unit);
    else onDay.set(`${a.id}@${a.day}`, a.unit);
  }
  for (const id of attrs.keys()) {
    if (!byId.has(id)) note("使える記号", `使える記号の「${id}」が表にいない`);
  }
  const usualUnit = staff.map((s) => usual.get(s.id) ?? s.unit);
  const unitOn = (i: number, d: number) => onDay.get(`${staff[i].id}@${d + 1}`) ?? usualUnit[i];
  const units = rules.units.length ? rules.units : [...new Set(usualUnit)];

  const nights = staff.map((s) => s.codes.filter((c) => codes.get(c)?.kind === "夜勤").length);
  const nightStaff = nights.map((n) => n > 0);
  const night = nights.filter((n) => n > 0);
  return {
    codes,
    rules,
    staff,
    days,
    requests: perStaff,
    koukyuBase: staff.map((s) => attrs.get(s.id)?.koukyu ?? rules.koukyuBase),
    nightStaff,
    nightAverage: night.length ? night.reduce((a, b) => a + b, 0) / night.length : 0,
    unitOn,
    usualUnit,
    units,
    checked: new Set(units),
    global,
  };
}

// 一人分の並び（i 番目の職員。row はその人の記号の並び）
export function staffIssues(p: Prepared, i: number, row: string[], sink: Sink): void {
  const { codes, rules } = p;
  const lv = rules.levels;
  const id = p.staff[i].id;
  const days = row.length;
  const defs = row.map((c) => codes.get(c));

  row.forEach((c, d) => {
    if (c === "") sink.add("中", WEIGHT.中, "空のマス", () => `${id} の ${d + 1}日が空`, { staffId: id, day: d + 1 });
    else if (!defs[d]) sink.add("必須", 0, "知らない記号", () => `${id} の ${d + 1}日「${c}」が記号の表にない`, { staffId: id, day: d + 1 });
  });

  const at = (rule: RuleKey, d: number, message: () => string, times = 1) =>
    sink.add(lv[rule], WEIGHT[lv[rule]] * times, rule, message, { staffId: id, day: d + 1 });
  // 続けて勤務した日数が上限を超えたら、超えた最初の日に1件。罰点は超えた日数の分
  let run = 0;
  const endRun = (end: number) => {
    const over = run - rules.maxConsecutive;
    if (over > 0) {
      const start = end - run;
      at("連続勤務", start + rules.maxConsecutive, () => `${id} が ${start + 1}日から ${run}日続けて勤務（上限 ${rules.maxConsecutive}日）`, over);
    }
    run = 0;
  };
  let lastNight = -Infinity;
  for (let d = 0; d < days; d++) {
    const def = defs[d];
    const next = d + 1 < days ? defs[d + 1] : undefined;
    const prev = d > 0 ? defs[d - 1] : undefined;
    if (def && isWork(def.kind)) run++;
    else endRun(d);
    if (def?.kind === "夜勤") {
      if (d + 1 < days && next?.kind !== "明け") at("夜勤の翌日", d + 1, () => `${id} の ${d + 1}日の夜勤の翌日が明けでない`);
      if (d - lastNight < rules.minNightGap) {
        const last = lastNight;
        at("夜勤の間隔", d, () => `${id} の夜勤が ${last + 1}日と ${d + 1}日で、間が ${rules.minNightGap}日より短い`);
      }
      lastNight = d;
      if (rules.beforeNightTag && d > 0 && prev && !prev.tags.includes(rules.beforeNightTag) && !isRest(prev.kind)) {
        at("夜勤の前日", d - 1, () => `${id} の ${d + 1}日の夜勤の前日が「${rules.beforeNightTag}」でも休みでもない`);
      }
    }
    if (def?.kind === "明け") {
      // 1日目の明けは前月の夜勤とみなす
      if (d > 0 && prev?.kind !== "夜勤") at("明けの前日", d, () => `${id} の ${d + 1}日の明けの前日が夜勤でない`);
      if (next && !isRest(next.kind)) at("明けの翌日", d + 1, () => `${id} の ${d + 1}日の明けの翌日が休みでない`);
    }
  }
  endRun(days);

  // 休み希望。叶わない希望が1人に寄らないよう、2件目・3件目…を重くする（1件目 ×1、2件目 ×2…）
  let missed = 0;
  for (const r of p.requests[i]) {
    const def = defs[r.day - 1];
    if (def && isRest(def.kind)) continue;
    const message = () => `${id} の ${r.day}日の休み希望${r.must ? "（必須）" : ""}が叶っていない（「${row[r.day - 1]}」）`;
    if (r.must) sink.add("必須", 0, "希望休", message, { staffId: id, day: r.day });
    else at("希望休", r.day - 1, message, ++missed);
  }

  // 公休の日数（基準から ±1 日はよい。年間で調整するものなので、ずれた日数だけ数える）
  const koukyu = defs.filter((def) => def?.kind === "公休").length;
  const base = p.koukyuBase[i];
  if (Math.abs(koukyu - base) > 1 && lv.公休の日数 !== "見ない") {
    sink.add(lv.公休の日数, WEIGHT[lv.公休の日数] * (Math.abs(koukyu - base) - 1), "公休の日数", () => `${id} の公休が ${koukyu}日（基準 ${base}日）`, {
      staffId: id,
    });
  }

  // 夜勤の回数の偏り（元の表で夜勤に入っていた人だけ。平均から ±1 回はよい）
  if (p.nightStaff[i] && lv.夜勤の回数 !== "見ない") {
    const n = defs.filter((def) => def?.kind === "夜勤").length;
    const off = Math.abs(n - p.nightAverage) - 1;
    if (off > 0) {
      sink.add(lv.夜勤の回数, WEIGHT[lv.夜勤の回数] * Math.ceil(off), "夜勤の回数", () => `${id} の夜勤が ${n}回（平均 ${p.nightAverage.toFixed(1)}回）`, {
        staffId: id,
      });
    }
  }
}

// その日の人数。counts を渡すと、need ごと・範囲ごとの人数を書き込む（画面の表の下の段に使う）
export function dayIssues(p: Prepared, d: number, grid: string[][], sink: Sink, counts?: Map<string, number>): void {
  const { staff, codes, units, checked } = p;
  p.rules.needs.forEach((need, k) => {
    if (need.scope === "facility") {
      let n = 0;
      for (let i = 0; i < staff.length; i++) if (matches(codes.get(grid[i][d]), staff[i], need)) n++;
      counts?.set(`${k}|`, n);
      if (n < need.min) {
        sink.add(need.level, WEIGHT[need.level] * (need.min - n), "人数", () => `${d + 1}日 全体 の ${needLabel(need)} が ${n}人（${need.min}人必要）`, {
          day: d + 1,
        });
      }
      return;
    }
    const byUnit = new Map<string, number>();
    const working: number[] = [];
    for (let i = 0; i < staff.length; i++) {
      if (!matches(codes.get(grid[i][d]), staff[i], need)) continue;
      working.push(i);
      const u = p.unitOn(i, d);
      byUnit.set(u, (byUnit.get(u) ?? 0) + 1);
    }
    for (const unit of units) {
      const n = byUnit.get(unit) ?? 0;
      counts?.set(`${k}|${unit}`, n);
      if (n >= need.min) continue;
      const message = `${d + 1}日 ユニット ${unit} の ${needLabel(need)} が ${n}人（${need.min}人必要）`;
      // ユニットに属さない人がほかで同じ枠に入っていて、そちらは足りているなら、応援で埋まる不足なので1段軽くする
      const helpers = working.filter((i) => {
        const u = p.unitOn(i, d);
        return !checked.has(staff[i].unit) && u !== unit && (!checked.has(u) || (byUnit.get(u) ?? 0) > need.min);
      });
      const level = helpers.length ? lighter(need.level) : need.level;
      sink.add(
        level,
        WEIGHT[level] * (need.min - n),
        "人数",
        () =>
          helpers.length
            ? `${message}。ユニット外の ${helpers.map((i) => staff[i].id).join("・")} が${needLabel(need)}に入っているので、応援なら足りる`
            : message,
        { day: d + 1, unit },
      );
    }
  });
}

export function check(
  roster: Roster,
  codes: CodeTable,
  rules: Rules,
  requests: Request[] = [],
  assignments: Assignment[] = [],
  attrs: Map<string, StaffAttr> = new Map(),
): CheckResult {
  const p = prepare(roster, codes, rules, requests, assignments, attrs);
  const sink = new IssueSink();
  const grid = roster.staff.map((s) => s.codes);
  roster.staff.forEach((s, i) => staffIssues(p, i, s.codes, sink));
  const issues = [...sink.issues, ...p.global];

  const daySink = new IssueSink();
  const counts = Array.from({ length: roster.days }, (_, d) => {
    const c = new Map<string, number>();
    dayIssues(p, d, grid, daySink, c);
    return c;
  });
  issues.push(...daySink.issues);

  const coverage: Coverage[] = rules.needs.flatMap((need, k) =>
    (need.scope === "unit" ? p.units.map((u) => u as string | undefined) : [undefined]).map((unit) => ({
      unit,
      need,
      counts: counts.map((c) => c.get(`${k}|${unit ?? ""}`) ?? 0),
    })),
  );

  const summaries: StaffSummary[] = roster.staff.map((s, i) => {
    const kinds = s.codes.map((c) => codes.get(c));
    let run = 0;
    let maxRun = 0;
    for (const k of kinds) {
      run = k && isWork(k.kind) ? run + 1 : 0;
      maxRun = Math.max(maxRun, run);
    }
    const requested = p.requests[i];
    return {
      id: s.id,
      unit: p.usualUnit[i],
      koukyu: kinds.filter((k) => k?.kind === "公休").length,
      nights: kinds.filter((k) => k?.kind === "夜勤").length,
      maxRun,
      leader: kinds.filter((k) => k?.tags.includes("リーダー")).length,
      requested: requested.length,
      granted: requested.filter((r) => {
        const k = kinds[r.day - 1];
        return k !== undefined && isRest(k.kind);
      }).length,
    };
  });

  return { issues, summaries, coverage };
}
