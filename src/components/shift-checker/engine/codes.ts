// 勤務表の記号の表。記号ごとに「種類」と「役割の札（タグ）」を持たせ、判定は記号ではなく種類と札で行う
// （職場ごとに記号は違うので、記号の表を差し替えれば同じ判定がそのまま使える）

export const KINDS = ["日勤", "夜勤", "明け", "公休", "休暇", "その他勤務"] as const;
export type Kind = (typeof KINDS)[number];

export interface CodeDef {
  code: string;
  kind: Kind;
  tags: string[];
}

export type CodeTable = Map<string, CodeDef>;

// 1行に1記号:「記号 種類 札 札 …」。# から後ろはコメント
export const DEFAULT_CODES_TEXT = `# 記号 種類 札…（種類: ${KINDS.join(" / ")}）
日 日勤
早 日勤 早
遅 日勤 遅
長 日勤 長
リ 日勤 リーダー
半 日勤 半日
研 その他勤務
夜 夜勤
入 夜勤
明 明け
休 公休
有 休暇
特 休暇
`;

export interface ParseCodesResult {
  table: CodeTable;
  errors: string[];
}

export function parseCodes(text: string): ParseCodesResult {
  const table: CodeTable = new Map();
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) return;
    const [code, kind, ...tags] = line.split(/\s+/);
    if (!(KINDS as readonly string[]).includes(kind ?? "")) {
      errors.push(`記号の表 ${i + 1}行目: 「${kind ?? ""}」は種類にない（${KINDS.join(" / ")}）`);
      return;
    }
    if (table.has(code)) {
      errors.push(`記号の表 ${i + 1}行目: 「${code}」が2回出てくる`);
      return;
    }
    table.set(code, { code, kind: kind as Kind, tags });
  });
  return { table, errors };
}

// 連続勤務に数える種類（明けも夜勤の続きなので数える）
export function isWork(kind: Kind): boolean {
  return kind === "日勤" || kind === "夜勤" || kind === "明け" || kind === "その他勤務";
}

// 休み希望が叶ったとみなす種類
export function isRest(kind: Kind): boolean {
  return kind === "公休" || kind === "休暇";
}
