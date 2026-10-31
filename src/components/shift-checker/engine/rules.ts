// 作り方の決まり（設定）。必要な人数は文字で書く:「各ユニット 早 1 高」「全体 夜勤 1 看護 必須」
import { KINDS, type Kind } from "./codes";

// 決まりの重み。必須はまず数を最小にし、そのうえで高・中・低の罰点の合計を小さくする（足し合わせない）
export const LEVELS = ["必須", "高", "中", "低", "見ない"] as const;
export type Level = (typeof LEVELS)[number];
export const WEIGHT: Record<Level, number> = { 必須: 0, 高: 100, 中: 10, 低: 1, 見ない: 0 };

// 1段だけ軽くする（ユニット外の人の応援で埋まる不足など）
export function lighter(level: Level): Level {
  return LEVELS[Math.min(LEVELS.indexOf(level) + 1, LEVELS.length - 1)];
}

export function isLevel(s: string): s is Level {
  return (LEVELS as readonly string[]).includes(s);
}

// 一人ひとりの並びの決まり。人数の決まりは Need ごとに重みを持つ
export const RULE_KEYS = ["夜勤の翌日", "明けの前日", "明けの翌日", "連続勤務", "夜勤の間隔", "夜勤の前日", "希望休", "公休の日数", "夜勤の回数"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

export const RULE_HINTS: Record<RuleKey, string> = {
  夜勤の翌日: "夜勤の翌日は明け",
  明けの前日: "明けの前日は夜勤",
  明けの翌日: "明けの翌日は休み",
  連続勤務: "連続勤務の上限",
  夜勤の間隔: "夜勤の入りから次の入りまでの日数",
  夜勤の前日: "夜勤の前日によい札",
  希望休: "休み希望（「!」を付けた日は必須）",
  公休の日数: "公休の日数が基準 ±1 日",
  夜勤の回数: "夜勤の回数が平均 ±1 回",
};

export const DEFAULT_LEVELS: Record<RuleKey, Level> = {
  夜勤の翌日: "必須",
  明けの前日: "必須",
  明けの翌日: "高",
  連続勤務: "高",
  夜勤の間隔: "高",
  夜勤の前日: "低",
  希望休: "高",
  公休の日数: "中",
  // 低だと、自動で組むときに夜勤を一部の人に寄せてしまう（多すぎる夜勤を止める決まりがほかに無い）
  夜勤の回数: "中",
};

export interface Need {
  scope: "unit" | "facility";
  // 種類（夜勤など）か札（早など）のどちらか
  target: string;
  min: number;
  // 職種にこの文字を含む人だけ数える（「看護」なら看護師・主任看護師…）
  role?: string;
  level: Level;
}

export interface Rules {
  needs: Need[];
  levels: Record<RuleKey, Level>;
  // ユニットごとの人数を見るユニット。空なら表に出てくる全部
  units: string[];
  maxConsecutive: number;
  minNightGap: number;
  koukyuBase: number;
  // 夜勤の前日に付いているとよい札。空なら見ない
  beforeNightTag: string;
}

export const DEFAULT_NEEDS_TEXT = `# 範囲（各ユニット / 全体） 種類か札 最低人数 [職種に含む文字] [重み: 必須 / 高 / 中 / 低]
各ユニット 早 1 高
各ユニット 遅 1 高
各ユニット リーダー 1 中
各ユニット 夜勤 1 必須
全体 夜勤 1 看護 必須
`;

export const DEFAULT_RULES: Omit<Rules, "needs"> = {
  levels: DEFAULT_LEVELS,
  units: [],
  maxConsecutive: 5,
  minNightGap: 3,
  koukyuBase: 10,
  beforeNightTag: "",
};

export function parseNeeds(text: string): { needs: Need[]; errors: string[] } {
  const needs: Need[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) return;
    const [scopeText, target, minText, ...rest] = line.split(/\s+/);
    const scope = scopeText === "各ユニット" ? "unit" : scopeText === "全体" ? "facility" : undefined;
    const min = Number(minText);
    const level = rest.find(isLevel) ?? "高";
    const role = rest.find((t) => !isLevel(t));
    if (!scope) {
      errors.push(`必要な人数 ${i + 1}行目: 範囲は「各ユニット」か「全体」`);
    } else if (!target || !Number.isInteger(min) || min < 0) {
      errors.push(`必要な人数 ${i + 1}行目: 「範囲 種類か札 人数」の形になっていない`);
    } else {
      needs.push({ scope, target, min, level, ...(role ? { role } : {}) });
    }
  });
  return { needs, errors };
}

export function needLabel(n: Need): string {
  return `${n.target}${n.role ? `（${n.role}）` : ""}`;
}

export function isKindName(s: string): s is Kind {
  return (KINDS as readonly string[]).includes(s);
}
