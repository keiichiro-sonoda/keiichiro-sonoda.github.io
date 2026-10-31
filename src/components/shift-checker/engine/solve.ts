// 勤務表を自動で直す・組む。焼きなまし法（局所探索）で、check.ts と同じ判定の罰点を小さくしていく
// - 1手ごとに表全体を調べ直さず、変えた人の並びと変えた日の人数だけを数え直す（差分評価）
// - 必須の違反は罰点に混ぜず、数を先に比べる（BIG を掛けて、どんな罰点の減りとも交換しない）
// - 局所探索なので「解が無い」ことは示せない。残った違反は、そのまま案に付けて見せる
import { isRest, type CodeTable } from "./codes";
import { dayIssues, prepare, staffIssues, TallySink, type Prepared, type Score, type StaffAttr } from "./check";
import type { Rules } from "./rules";
import { weekday } from "./sample";
import type { Assignment, Request, Roster } from "./table";

export type SolveMode = "fix" | "generate";

export interface SolveInput {
  // 修正案なら直す表、0 から組むなら手本にする表（職員・ユニット・使える記号を読む。先月の表など）
  roster: Roster;
  codes: CodeTable;
  rules: Rules;
  requests: Request[];
  assignments: Assignment[];
  attrs: Map<string, StaffAttr>;
  mode: SolveMode;
  // 0 から組む月（曜日と日数）
  year: number;
  month: number;
  seed: number;
}

export interface SolveState {
  score: Score;
  // 元の表から変えたマスの数（修正案のとき）
  changed: number;
}

// 必須の違反1件は、どんな罰点よりも重い
const BIG = 1e7;
// 修正案で、マスを1つ変えるごとの罰点（低の決まり1件より重く、中の決まり1件より軽い）
export const CHANGE_WEIGHT = 2;

// 再現できる乱数（テストで同じ結果になるように）
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOVABLE_KINDS = new Set(["日勤", "夜勤", "明け", "公休"]);

// 表から、その人が使っている記号（自動で置いてよい記号）を読む。休みと、夜勤に入る人の明けは必ず足す
export function inferAttrs(roster: Roster, codes: CodeTable, koukyuBase: number): Map<string, StaffAttr> {
  const rest = firstOfKind(codes, "公休");
  const ake = firstOfKind(codes, "明け");
  const out = new Map<string, StaffAttr>();
  for (const s of roster.staff) {
    const used = [...new Set(s.codes)].filter((c) => MOVABLE_KINDS.has(codes.get(c)?.kind ?? ""));
    if (rest && !used.includes(rest)) used.push(rest);
    if (ake && !used.includes(ake) && used.some((c) => codes.get(c)?.kind === "夜勤")) used.push(ake);
    const koukyu = s.codes.filter((c) => codes.get(c)?.kind === "公休").length;
    // 公休が基準よりずっと多い人（パートなど）は、その日数を基準にする
    out.set(s.id, koukyu >= koukyuBase + 5 ? { codes: used, koukyu } : { codes: used });
  }
  return out;
}

function firstOfKind(codes: CodeTable, kind: string): string | undefined {
  for (const def of codes.values()) if (def.kind === kind) return def.code;
  return undefined;
}

export class Solver {
  readonly p: Prepared;
  readonly grid: string[][];
  readonly original: string[][];
  private readonly locked: boolean[][];
  private readonly allowed: string[][];
  private readonly staffHard: number[];
  private readonly staffSoft: number[];
  private readonly dayHard: number[];
  private readonly daySoft: number[];
  private readonly tally = new TallySink();
  private readonly random: () => number;
  private readonly changeWeight: number;
  private readonly night?: string;
  private readonly ake?: string;
  private readonly rest: string;
  private changed = 0;
  private value: number;
  bestValue: number;
  bestGrid: string[][];
  best: SolveState;
  readonly initial: SolveState;
  iterations = 0;

  constructor(input: SolveInput) {
    const { roster, codes, rules } = input;
    this.random = rng(input.seed);
    this.rest = firstOfKind(codes, "公休") ?? "休";
    this.night = firstOfKind(codes, "夜勤");
    this.ake = firstOfKind(codes, "明け");
    // 使える記号は書いていなければ表から読む。公休の基準は書いたものだけ使う（チェッカーと同じ基準にするため）
    const inferred = inferAttrs(roster, codes, rules.koukyuBase);
    const attrs = new Map(roster.staff.map((s) => [s.id, { codes: inferred.get(s.id)?.codes, ...input.attrs.get(s.id) }]));
    this.allowed = roster.staff.map((s) => (attrs.get(s.id)?.codes ?? []).filter((c) => codes.has(c)));

    const days = input.mode === "fix" ? roster.days : new Date(input.year, input.month, 0).getDate();
    this.locked = roster.staff.map(() => Array<boolean>(days).fill(false));
    if (input.mode === "fix") {
      this.grid = roster.staff.map((s) => [...s.codes]);
      // 休暇・研修など、自動で置かない記号のマスは動かさない
      this.grid.forEach((row, i) => row.forEach((c, d) => (this.locked[i][d] = !MOVABLE_KINDS.has(codes.get(c)?.kind ?? ""))));
      this.changeWeight = CHANGE_WEIGHT;
    } else {
      this.grid = roster.staff.map((s, i) => this.firstDraft(s.codes, i, days, input));
      this.changeWeight = 0;
    }
    this.original = this.grid.map((row) => [...row]);

    const working: Roster = { days, staff: roster.staff.map((s, i) => ({ ...s, codes: this.grid[i] })) };
    this.p = prepare(working, codes, rules, input.requests, input.assignments, attrs);
    if (input.mode === "generate") {
      // 夜勤の回数の目安は手本の表から取る（組み始めの表は崩れているので）
      const ref = prepare(roster, codes, rules);
      this.p.nightStaff = ref.nightStaff;
      this.p.nightAverage = (ref.nightAverage * days) / roster.days;
    }

    this.staffHard = this.grid.map(() => 0);
    this.staffSoft = this.grid.map(() => 0);
    this.dayHard = Array<number>(days).fill(0);
    this.daySoft = Array<number>(days).fill(0);
    this.grid.forEach((_, i) => this.scoreStaff(i));
    for (let d = 0; d < days; d++) this.scoreDay(d);
    this.value = this.total();
    this.bestValue = this.value;
    this.bestGrid = this.grid.map((row) => [...row]);
    this.best = this.state();
    this.initial = this.best;
  }

  // 0 から組むときの最初の表。手本の表の並びを同じ日付に写し、使えない記号は休みにする。
  // 平日だけの人（人数に数える札を持たない人）は、平日を勤務・土日を休みにする
  private firstDraft(prev: string[], i: number, days: number, input: SolveInput): string[] {
    const { codes, rules } = input;
    const allowed = new Set(this.allowed[i]);
    const counted = this.allowed[i].some((c) => {
      const def = codes.get(c)!;
      return rules.needs.some((n) => def.kind === n.target || def.tags.includes(n.target));
    });
    let row: string[];
    if (!counted) {
      const work = this.allowed[i].find((c) => !isRest(codes.get(c)!.kind)) ?? this.rest;
      row = Array.from({ length: days }, (_, d) => {
        const w = weekday(input.year, input.month, d + 1);
        return w === 0 || w === 6 ? this.rest : work;
      });
    } else {
      row = Array.from({ length: days }, (_, d) => {
        const c = prev[d % prev.length];
        return allowed.has(c) ? c : this.rest;
      });
    }
    for (const r of input.requests) {
      if (r.id === input.roster.staff[i].id && r.day <= days) row[r.day - 1] = this.rest;
    }
    // 夜勤の翌日は明け、明けの前日は夜勤にそろえる
    for (let d = 0; d < days; d++) {
      const kind = codes.get(row[d])?.kind;
      if (kind === "夜勤" && d + 1 < days && this.ake) row[d + 1] = this.ake;
      else if (kind === "明け" && d > 0 && codes.get(row[d - 1])?.kind !== "夜勤") row[d] = this.rest;
    }
    // 先月末が夜勤なら、1日は明けで動かさない
    if (codes.get(prev[prev.length - 1])?.kind === "夜勤" && this.ake) {
      row[0] = this.ake;
      this.locked[i][0] = true;
    }
    return row;
  }

  private scoreStaff(i: number): void {
    this.tally.reset();
    staffIssues(this.p, i, this.grid[i], this.tally);
    this.staffHard[i] = this.tally.hard;
    this.staffSoft[i] = this.tally.soft;
  }

  private scoreDay(d: number): void {
    this.tally.reset();
    dayIssues(this.p, d, this.grid, this.tally);
    this.dayHard[d] = this.tally.hard;
    this.daySoft[d] = this.tally.soft;
  }

  private total(): number {
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    return BIG * (sum(this.staffHard) + sum(this.dayHard)) + sum(this.staffSoft) + sum(this.daySoft) + this.changeWeight * this.changed;
  }

  private state(): SolveState {
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    return {
      score: { hard: sum(this.staffHard) + sum(this.dayHard), soft: sum(this.staffSoft) + sum(this.daySoft) },
      changed: this.changed,
    };
  }

  // マスの変更をまとめて試し、良くなるか、温度に応じた確率で採る。採らなければ元に戻す
  private tryChanges(cells: [number, number, string][], temperature: number): void {
    for (const [i, d, c] of cells) {
      if (this.locked[i][d] || !this.allowed[i].includes(c)) return;
    }
    const before = cells.map(([i, d]) => this.grid[i][d]);
    if (cells.every(([, , c], k) => c === before[k])) return;
    const staff = [...new Set(cells.map(([i]) => i))];
    const days = [...new Set(cells.map(([, d]) => d))];
    const oldPart =
      BIG * (staff.reduce((s, i) => s + this.staffHard[i], 0) + days.reduce((s, d) => s + this.dayHard[d], 0)) +
      staff.reduce((s, i) => s + this.staffSoft[i], 0) +
      days.reduce((s, d) => s + this.daySoft[d], 0);
    const saved = { sh: staff.map((i) => [this.staffHard[i], this.staffSoft[i]]), dh: days.map((d) => [this.dayHard[d], this.daySoft[d]]) };
    let changedDelta = 0;
    cells.forEach(([i, d, c], k) => {
      changedDelta += (c !== this.original[i][d] ? 1 : 0) - (before[k] !== this.original[i][d] ? 1 : 0);
      this.grid[i][d] = c;
    });
    staff.forEach((i) => this.scoreStaff(i));
    days.forEach((d) => this.scoreDay(d));
    const newPart =
      BIG * (staff.reduce((s, i) => s + this.staffHard[i], 0) + days.reduce((s, d) => s + this.dayHard[d], 0)) +
      staff.reduce((s, i) => s + this.staffSoft[i], 0) +
      days.reduce((s, d) => s + this.daySoft[d], 0);
    const delta = newPart - oldPart + this.changeWeight * changedDelta;
    if (delta <= 0 || (delta < BIG && this.random() < Math.exp(-delta / temperature))) {
      this.value += delta;
      this.changed += changedDelta;
      if (this.value < this.bestValue) {
        this.bestValue = this.value;
        this.bestGrid = this.grid.map((row) => [...row]);
        this.best = this.state();
      }
      return;
    }
    cells.forEach(([i, d], k) => (this.grid[i][d] = before[k]));
    staff.forEach((i, k) => ([this.staffHard[i], this.staffSoft[i]] = saved.sh[k]));
    days.forEach((d, k) => ([this.dayHard[d], this.daySoft[d]] = saved.dh[k]));
  }

  private pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.random() * xs.length)];
  }

  // 1手試す。手は「1マス変える」「同じ日に2人の勤務を入れ替える」「2〜3日分を2人で入れ替える」
  // 「夜勤・明け・休みの塊を置く」「夜勤と明けを休みにする」のどれか
  step(temperature: number): void {
    this.iterations++;
    const n = this.grid.length;
    const days = this.grid[0]?.length ?? 0;
    if (n === 0 || days === 0) return;
    const i = Math.floor(this.random() * n);
    const d = Math.floor(this.random() * days);
    // 修正案では「元に戻す」手も混ぜる。1マスずつの手だけでは、夜勤の塊などを元の形に戻せない
    if (this.changeWeight > 0 && this.random() < 0.2) {
      const len = 1 + Math.floor(this.random() * 3);
      const cells: [number, number, string][] = [];
      for (let k = d; k < Math.min(days, d + len); k++) cells.push([i, k, this.original[i][k]]);
      this.tryChanges(cells, temperature);
      return;
    }
    const r = this.random();
    if (r < 0.3) {
      this.tryChanges([[i, d, this.pick(this.allowed[i])]], temperature);
    } else if (r < 0.6) {
      const j = Math.floor(this.random() * n);
      if (i !== j) this.tryChanges([[i, d, this.grid[j][d]], [j, d, this.grid[i][d]]], temperature);
    } else if (r < 0.8) {
      const j = Math.floor(this.random() * n);
      const len = 2 + Math.floor(this.random() * 2);
      if (i === j || d + len > days) return;
      const cells: [number, number, string][] = [];
      for (let k = d; k < d + len; k++) cells.push([i, k, this.grid[j][k]], [j, k, this.grid[i][k]]);
      this.tryChanges(cells, temperature);
    } else if (r < 0.92) {
      if (!this.night || !this.ake || d + 1 >= days) return;
      const cells: [number, number, string][] = [
        [i, d, this.night],
        [i, d + 1, this.ake],
      ];
      if (d + 2 < days) cells.push([i, d + 2, this.rest]);
      this.tryChanges(cells, temperature);
    } else {
      if (d + 1 >= days) return;
      this.tryChanges(
        [
          [i, d, this.rest],
          [i, d + 1, this.rest],
        ],
        temperature,
      );
    }
  }

  // 温度を高い所から下げながら回す（progress は 0〜1）。高いうちは悪くなる手も採って、行き詰まりから抜ける。
  // 修正案は元の表の近くを探したいので、低い温度から始める（高いと、元の表から離れたまま戻ってこない）
  temperature(progress: number): number {
    const [hot, cold] = this.changeWeight > 0 ? [2, 0.1] : [60, 0.5];
    return hot * Math.pow(cold / hot, Math.min(1, Math.max(0, progress)));
  }

  run(iterations: number, progress: number): void {
    const t = this.temperature(progress);
    for (let k = 0; k < iterations; k++) this.step(t);
  }
}

// 案を、見出し付きの表（タブ区切り）にする。Excel にそのまま貼れる
export function toTableText(roster: Roster): string {
  const header = ["番号", "ユニット", "職種", ...Array.from({ length: roster.days }, (_, d) => String(d + 1))];
  const rows = roster.staff.map((s) => [s.id, s.unit, s.role, ...s.codes]);
  return [header, ...rows].map((r) => r.join("\t")).join("\n");
}
