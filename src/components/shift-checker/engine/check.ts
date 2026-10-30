// 勤務表を決まりに照らして、合っていないところを挙げる。画面には依存しない
import { isRest, isWork, type CodeDef, type CodeTable } from "./codes";
import { isKindName, needLabel, type Need, type Rules } from "./rules";
import type { Assignment, Request, Roster, Staff } from "./table";

// 違反: 決まりを破っている / 注意: 破ってはいないが確かめたほうがよい / 参考: 定番から外れている
export type Severity = "違反" | "注意" | "参考";
export const SEVERITIES: Severity[] = ["違反", "注意", "参考"];

export interface Issue {
  severity: Severity;
  rule: string;
  message: string;
  staffId?: string;
  // 1 始まり
  day?: number;
  unit?: string;
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

function matches(def: CodeDef | undefined, staff: Staff, need: Need): boolean {
  if (!def) return false;
  const hit = isKindName(need.target) ? def.kind === need.target : def.tags.includes(need.target);
  return hit && (!need.role || staff.role.includes(need.role));
}

export function check(
  roster: Roster,
  codes: CodeTable,
  rules: Rules,
  requests: Request[] = [],
  assignments: Assignment[] = [],
): CheckResult {
  const issues: Issue[] = [];
  const { days, staff } = roster;
  const defOf = (s: Staff, d: number) => codes.get(s.codes[d]);

  // 記号そのもの
  for (const s of staff) {
    s.codes.forEach((c, d) => {
      if (c === "") {
        issues.push({ severity: "注意", rule: "空のマス", message: `${s.id} の ${d + 1}日が空`, staffId: s.id, day: d + 1 });
      } else if (!codes.has(c)) {
        issues.push({
          severity: "違反",
          rule: "知らない記号",
          message: `${s.id} の ${d + 1}日「${c}」が記号の表にない`,
          staffId: s.id,
          day: d + 1,
        });
      }
    });
  }

  // 一人ひとりの並び
  const summaries: StaffSummary[] = staff.map((s) => {
    let run = 0;
    let maxRun = 0;
    let lastNight = -Infinity;
    let runStart = 0;
    for (let d = 0; d < days; d++) {
      const def = defOf(s, d);
      const next = d + 1 < days ? defOf(s, d + 1) : undefined;
      const prev = d > 0 ? defOf(s, d - 1) : undefined;
      if (def && isWork(def.kind)) {
        if (run === 0) runStart = d;
        run++;
        if (run > maxRun) maxRun = run;
        // 上限を超えた最初の日に1回だけ挙げる
        if (run === rules.maxConsecutive + 1) {
          issues.push({
            severity: "違反",
            rule: "連続勤務",
            message: `${s.id} が ${runStart + 1}日から ${rules.maxConsecutive}日を超えて続けて勤務`,
            staffId: s.id,
            day: d + 1,
          });
        }
      } else {
        run = 0;
      }
      if (def?.kind === "夜勤") {
        if (d + 1 < days && next?.kind !== "明け") {
          issues.push({ severity: "違反", rule: "夜勤の翌日", message: `${s.id} の ${d + 1}日の夜勤の翌日が明けでない`, staffId: s.id, day: d + 2 });
        }
        if (d - lastNight < rules.minNightGap) {
          issues.push({
            severity: "違反",
            rule: "夜勤の間隔",
            message: `${s.id} の夜勤が ${lastNight + 1}日と ${d + 1}日で、間が ${rules.minNightGap}日より短い`,
            staffId: s.id,
            day: d + 1,
          });
        }
        lastNight = d;
        if (rules.beforeNightTag && d > 0 && prev && !prev.tags.includes(rules.beforeNightTag) && !isRest(prev.kind)) {
          issues.push({
            severity: "参考",
            rule: "夜勤の前日",
            message: `${s.id} の ${d + 1}日の夜勤の前日が「${rules.beforeNightTag}」でも休みでもない`,
            staffId: s.id,
            day: d,
          });
        }
      }
      if (def?.kind === "明け") {
        if (d > 0 && prev?.kind !== "夜勤") {
          issues.push({ severity: "違反", rule: "明けの前日", message: `${s.id} の ${d + 1}日の明けの前日が夜勤でない`, staffId: s.id, day: d + 1 });
        }
        if (next && !isRest(next.kind)) {
          issues.push({ severity: "注意", rule: "明けの翌日", message: `${s.id} の ${d + 1}日の明けの翌日が休みでない`, staffId: s.id, day: d + 2 });
        }
      }
    }
    const kinds = s.codes.map((c) => codes.get(c));
    return {
      id: s.id,
      unit: s.unit,
      koukyu: kinds.filter((k) => k?.kind === "公休").length,
      nights: kinds.filter((k) => k?.kind === "夜勤").length,
      maxRun,
      leader: kinds.filter((k) => k?.tags.includes("リーダー")).length,
      requested: 0,
      granted: 0,
    };
  });

  // 希望休
  const byId = new Map(staff.map((s, i) => [s.id, i]));
  for (const r of requests) {
    const i = byId.get(r.id);
    if (i === undefined) {
      issues.push({ severity: "注意", rule: "希望休", message: `希望休の「${r.id}」が表にいない` });
      continue;
    }
    if (r.day > days) continue;
    summaries[i].requested++;
    const def = defOf(staff[i], r.day - 1);
    if (def && isRest(def.kind)) {
      summaries[i].granted++;
    } else {
      issues.push({
        severity: "違反",
        rule: "希望休",
        message: `${r.id} の ${r.day}日の休み希望が叶っていない（「${staff[i].codes[r.day - 1]}」）`,
        staffId: r.id,
        day: r.day,
      });
    }
  }

  // 数え先。ユニットに属さない人を、人数を数えるときにどのユニットに入れるか
  const usual = new Map<string, string>();
  const onDay = new Map<string, string>();
  for (const a of assignments) {
    if (!byId.has(a.id)) {
      issues.push({ severity: "注意", rule: "数え先", message: `数え先の「${a.id}」が表にいない` });
    } else if (a.day === undefined) {
      usual.set(a.id, a.unit);
    } else {
      onDay.set(`${a.id}@${a.day}`, a.unit);
    }
  }
  const usualUnit = (s: Staff) => usual.get(s.id) ?? s.unit;
  const unitOn = (s: Staff, d: number) => onDay.get(`${s.id}@${d + 1}`) ?? usualUnit(s);
  staff.forEach((s, i) => (summaries[i].unit = usualUnit(s)));

  // 毎日の人数
  const units = rules.units.length ? rules.units : [...new Set(staff.map(usualUnit))];
  const checked = new Set(units);
  const coverage: Coverage[] = rules.needs.flatMap((need) =>
    (need.scope === "unit" ? units.map((u) => u as string | undefined) : [undefined]).map((unit) => ({
      unit,
      need,
      counts: Array.from(
        { length: days },
        (_, d) => staff.filter((s) => (unit === undefined || unitOn(s, d) === unit) && matches(defOf(s, d), s, need)).length,
      ),
    })),
  );
  // その人を抜いても、数えたユニットの人数が足りるか
  const spare = (s: Staff, need: Need, d: number) => {
    const cov = coverage.find((c) => c.need === need && c.unit === unitOn(s, d));
    return !cov || cov.counts[d] > need.min;
  };
  for (const { unit, need, counts } of coverage) {
    counts.forEach((n, d) => {
      if (n >= need.min) return;
      const where = unit === undefined ? "全体" : `ユニット ${unit}`;
      const message = `${d + 1}日 ${where} の ${needLabel(need)} が ${n}人（${need.min}人必要）`;
      // ユニットに属さない人がほかで同じ枠に入っていて、そちらは足りているなら、応援で埋まる不足なので注意にとどめる
      const helpers =
        unit === undefined
          ? []
          : staff.filter((s) => !checked.has(s.unit) && unitOn(s, d) !== unit && matches(defOf(s, d), s, need) && spare(s, need, d));
      issues.push(
        helpers.length
          ? {
              severity: "注意",
              rule: "人数",
              message: `${message}。ユニット外の ${helpers.map((s) => s.id).join("・")} が${needLabel(need)}に入っているので、応援なら足りる`,
              day: d + 1,
              unit,
            }
          : { severity: "違反", rule: "人数", message, day: d + 1, unit },
      );
    });
  }

  return { issues, summaries, coverage };
}
