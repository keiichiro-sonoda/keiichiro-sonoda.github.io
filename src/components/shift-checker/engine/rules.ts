// 作り方の決まり（設定）。必要な人数は文字で書く:「各ユニット 早 1」「全体 夜勤 1 看護」
import { KINDS, type Kind } from "./codes";

export interface Need {
  scope: "unit" | "facility";
  // 種類（夜勤など）か札（早など）のどちらか
  target: string;
  min: number;
  // 職種にこの文字を含む人だけ数える（「看護」なら看護師・主任看護師…）
  role?: string;
}

export interface Rules {
  needs: Need[];
  // ユニットごとの人数を見るユニット。空なら表に出てくる全部
  units: string[];
  maxConsecutive: number;
  minNightGap: number;
  koukyuBase: number;
  // 夜勤の前日に付いているとよい札。空なら見ない
  beforeNightTag: string;
}

export const DEFAULT_NEEDS_TEXT = `# 範囲（各ユニット / 全体） 種類か札 最低人数 [職種に含む文字]
各ユニット 早 1
各ユニット 遅 1
各ユニット リーダー 1
各ユニット 夜勤 1
全体 夜勤 1 看護
`;

export const DEFAULT_RULES: Omit<Rules, "needs"> = {
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
    const [scopeText, target, minText, role] = line.split(/\s+/);
    const scope = scopeText === "各ユニット" ? "unit" : scopeText === "全体" ? "facility" : undefined;
    const min = Number(minText);
    if (!scope) {
      errors.push(`必要な人数 ${i + 1}行目: 範囲は「各ユニット」か「全体」`);
    } else if (!target || !Number.isInteger(min) || min < 0) {
      errors.push(`必要な人数 ${i + 1}行目: 「範囲 種類か札 人数」の形になっていない`);
    } else {
      needs.push({ scope, target, min, ...(role ? { role } : {}) });
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
