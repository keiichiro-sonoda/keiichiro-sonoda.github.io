// 貼り付けた勤務表（Excel からのコピーならタブ区切り。CSV も読む）を、職員ごとの並びにする

export interface Staff {
  id: string;
  unit: string;
  role: string;
  // codes[d] が d+1 日の記号。空のマスは ""
  codes: string[];
}

export interface Roster {
  days: number;
  staff: Staff[];
}

export interface ParseTableResult {
  roster?: Roster;
  errors: string[];
}

const ID_HEADERS = ["番号", "名前", "氏名", "職員", "ID", "id"];
const UNIT_HEADERS = ["ユニット", "部署", "所属", "フロア"];
const ROLE_HEADERS = ["職種", "職名", "役職"];

function splitLine(line: string): string[] {
  const cells = line.includes("\t") ? line.split("\t") : line.split(",");
  return cells.map((c) => c.trim());
}

function findColumn(header: string[], names: string[]): number {
  return header.findIndex((h) => names.includes(h));
}

// 見出しの行: 番号（か名前）・ユニット・職種（任意）と、1〜31 の日付。ほかの列（公休数など）は読まない
export function parseTable(text: string): ParseTableResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { errors: ["表が空"] };
  const header = splitLine(lines[0]);
  const idCol = findColumn(header, ID_HEADERS);
  const unitCol = findColumn(header, UNIT_HEADERS);
  const roleCol = findColumn(header, ROLE_HEADERS);
  const dayCols: number[] = [];
  header.forEach((h, i) => {
    const m = /^(\d{1,2})日?$/.exec(h);
    if (m && Number(m[1]) === dayCols.length + 1) dayCols.push(i);
  });

  const errors: string[] = [];
  if (idCol < 0) errors.push(`1行目（見出し）に「${ID_HEADERS[0]}」か「${ID_HEADERS[1]}」の列がない`);
  if (unitCol < 0) errors.push(`1行目（見出し）に「${UNIT_HEADERS[0]}」の列がない`);
  if (dayCols.length < 28) errors.push(`1行目（見出し）に 1 から順に並んだ日付の列がない（見つかったのは ${dayCols.length} 日分）`);
  if (errors.length) return { errors };

  const staff: Staff[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, i) => {
    const cells = splitLine(line);
    const id = cells[idCol] ?? "";
    if (!id) {
      errors.push(`${i + 2}行目: ${header[idCol]}が空`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`${i + 2}行目: ${header[idCol]}「${id}」が2回出てくる`);
      return;
    }
    seen.add(id);
    staff.push({
      id,
      unit: cells[unitCol] ?? "",
      role: roleCol >= 0 ? (cells[roleCol] ?? "") : "",
      codes: dayCols.map((c) => cells[c] ?? ""),
    });
  });
  if (staff.length === 0) errors.push("職員の行がない");
  return { roster: staff.length ? { days: dayCols.length, staff } : undefined, errors };
}

// 希望休: 1行に1人「番号: 3, 15, 22」（区切りは , 、 空白のどれでもよい）
export interface Request {
  id: string;
  day: number;
}

function parseDay(tok: string): number | undefined {
  const day = Number(tok.replace(/日$/, ""));
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
}

export function parseRequests(text: string): { requests: Request[]; errors: string[] } {
  const requests: Request[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = /^([^:：]+)[:：](.*)$/.exec(line);
    if (!m) {
      errors.push(`希望休 ${i + 1}行目: 「番号: 日, 日」の形になっていない`);
      return;
    }
    const id = m[1].trim();
    for (const tok of m[2].split(/[,、\s]+/).filter(Boolean)) {
      const day = parseDay(tok);
      if (day === undefined) {
        errors.push(`希望休 ${i + 1}行目: 「${tok}」は日付として読めない`);
        continue;
      }
      requests.push({ id, day });
    }
  });
  return { requests, errors };
}

// ユニットに属さない人を、人数を数えるときにどのユニットに入れるか。
// 「S1: B」はふだんの数え先、「S1: 3, 4 A」はその日だけの数え先（応援）
export interface Assignment {
  id: string;
  unit: string;
  // 無ければふだんの数え先
  day?: number;
}

export function parseAssignments(text: string): { assignments: Assignment[]; errors: string[] } {
  const assignments: Assignment[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) return;
    const m = /^([^:：]+)[:：](.*)$/.exec(line);
    const toks = m ? m[2].split(/[,、\s]+/).filter(Boolean) : [];
    const unit = toks.pop();
    if (!m || unit === undefined || parseDay(unit) !== undefined) {
      errors.push(`数え先 ${i + 1}行目: 「番号: ユニット」か「番号: 日, 日 ユニット」の形になっていない`);
      return;
    }
    const id = m[1].trim();
    if (toks.length === 0) {
      assignments.push({ id, unit });
      return;
    }
    for (const tok of toks) {
      const day = parseDay(tok);
      if (day === undefined) {
        errors.push(`数え先 ${i + 1}行目: 「${tok}」は日付として読めない`);
        continue;
      }
      assignments.push({ id, unit, day });
    }
  });
  return { assignments, errors };
}
