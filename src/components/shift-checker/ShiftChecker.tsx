// 勤務表のチェッカー。貼り付けた表を決まりに照らして色を付ける。計算は軽いので Worker には移さない
// 貼り付けた中身はこのページの中だけで扱い、送らない・保存しない（記事のページで通信そのものも止めている）
import { useMemo, useState, type ReactNode } from "react";
import { DEFAULT_CODES_TEXT, parseCodes, type CodeDef } from "./engine/codes";
import { check, SEVERITIES, type Issue, type Severity } from "./engine/check";
import { DEFAULT_NEEDS_TEXT, DEFAULT_RULES, needLabel, parseNeeds } from "./engine/rules";
import { daysInMonth, makeSample, SAMPLE_MONTH, SAMPLE_YEAR, weekday } from "./engine/sample";
import { parseAssignments, parseRequests, parseTable } from "./engine/table";
import "./shift-checker.css";

const WEEK = "日月火水木金土";
const SEVERITY_RANK: Record<Severity, number> = { 違反: 0, 注意: 1, 参考: 2 };

interface Settings {
  year: number;
  month: number;
  units: string;
  koukyuBase: number;
  maxConsecutive: number;
  minNightGap: number;
  beforeNightTag: string;
}

const INITIAL_SETTINGS: Settings = {
  year: SAMPLE_YEAR,
  month: SAMPLE_MONTH,
  units: "",
  koukyuBase: DEFAULT_RULES.koukyuBase,
  maxConsecutive: DEFAULT_RULES.maxConsecutive,
  minNightGap: DEFAULT_RULES.minNightGap,
  beforeNightTag: DEFAULT_RULES.beforeNightTag,
};

const cellKey = (staffId: string, day: number) => `${staffId}@${day}`;
const dayKey = (day: number) => `@${day}`;
// 人に付く指摘はそのマス、人数の指摘はその日の見出しに付ける
const issueKey = (i: Issue) => (i.day === undefined ? undefined : i.staffId ? cellKey(i.staffId, i.day) : dayKey(i.day));

export default function ShiftChecker() {
  const [tableText, setTableText] = useState("");
  const [requestsText, setRequestsText] = useState("");
  const [assignmentsText, setAssignmentsText] = useState("");
  const [codesText, setCodesText] = useState(DEFAULT_CODES_TEXT);
  const [needsText, setNeedsText] = useState(DEFAULT_NEEDS_TEXT);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [shown, setShown] = useState<Record<Severity, boolean>>({ 違反: true, 注意: true, 参考: false });
  const [selected, setSelected] = useState<string>();

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  const loadSample = () => {
    const s = makeSample();
    setTableText(s.table);
    setRequestsText(s.requests);
    setAssignmentsText(s.assignments);
    setSettings({ ...INITIAL_SETTINGS, units: s.units.join(", ") });
    setSelected(undefined);
  };
  const clear = () => {
    setTableText("");
    setRequestsText("");
    setAssignmentsText("");
    setSelected(undefined);
  };

  const { errors, result } = useMemo(() => {
    const table = parseTable(tableText);
    const codes = parseCodes(codesText);
    const needs = parseNeeds(needsText);
    const requests = parseRequests(requestsText);
    const assignments = parseAssignments(assignmentsText);
    const errors = [
      ...(tableText.trim() ? table.errors : []),
      ...codes.errors,
      ...needs.errors,
      ...requests.errors,
      ...assignments.errors,
    ];
    if (!tableText.trim() || !table.roster) return { errors, result: undefined };
    const rules = {
      needs: needs.needs,
      units: settings.units.split(/[,、\s]+/).filter(Boolean),
      koukyuBase: settings.koukyuBase,
      maxConsecutive: settings.maxConsecutive,
      minNightGap: settings.minNightGap,
      beforeNightTag: settings.beforeNightTag.trim(),
    };
    return {
      errors,
      result: {
        roster: table.roster,
        codes: codes.table,
        requests: new Set(requests.requests.map((r) => cellKey(r.id, r.day))),
        ...check(table.roster, codes.table, rules, requests.requests, assignments.assignments),
      },
    };
  }, [tableText, codesText, needsText, requestsText, assignmentsText, settings]);

  const visible = (result?.issues ?? []).filter((i) => shown[i.severity]);
  // マスごとに、いちばん重い指摘を色にする
  const byCell = new Map<string, Issue[]>();
  for (const i of visible) {
    const key = issueKey(i);
    if (key) byCell.set(key, [...(byCell.get(key) ?? []), i]);
  }
  // 選んだら、押したのと反対側（表のマスを押したら一覧、一覧を押したら表）を見える位置に出す
  const select = (key: string | undefined, reveal: ".sc-grid" | ".sc-issues") => {
    setSelected(key);
    if (!key) return;
    requestAnimationFrame(() => {
      document.querySelector(`${reveal} [data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
    });
  };
  const worst = (list: Issue[] | undefined) =>
    list?.reduce<Severity | undefined>((w, i) => (!w || SEVERITY_RANK[i.severity] < SEVERITY_RANK[w] ? i.severity : w), undefined);

  const monthDays = daysInMonth(settings.year, settings.month);
  const days = result?.roster.days ?? 0;
  const counts = SEVERITIES.map((s) => [s, (result?.issues ?? []).filter((i) => i.severity === s).length] as const);

  return (
    <div className="sc">
      <p className="sc-privacy">
        🔒 貼り付けた表は、このページの中だけで処理します。どこにも送らず、保存もしません（ページを閉じると消えます）。
      </p>

      <section className="sc-input">
        <div className="sc-input-main">
          <label className="sc-label" htmlFor="sc-table">
            勤務表
          </label>
          <p className="sc-hint">
            Excel で、見出しの行（<code>番号</code>・<code>ユニット</code>・<code>職種</code>・<code>1</code>〜<code>31</code>）ごと範囲を選んでコピーし、貼り付けます。ほかの列は読みません。
          </p>
          <textarea
            id="sc-table"
            className="sc-textarea sc-table-input"
            rows={8}
            spellCheck={false}
            placeholder={"番号\tユニット\t職種\t1\t2\t3\t…\n1\tA\t介護員\tリ\t夜\t明\t…"}
            value={tableText}
            onChange={(e) => setTableText(e.target.value)}
          />
          <div className="sc-buttons">
            <button type="button" onClick={loadSample}>
              架空の表を入れてみる
            </button>
            <button type="button" onClick={clear} disabled={!tableText && !requestsText && !assignmentsText}>
              消す
            </button>
          </div>
        </div>

        <div className="sc-input-side">
          <label className="sc-label" htmlFor="sc-requests">
            休み希望
          </label>
          <p className="sc-hint">1行に1人「番号: 日, 日」</p>
          <textarea
            id="sc-requests"
            className="sc-textarea"
            rows={4}
            spellCheck={false}
            placeholder={"A1: 3, 15, 22"}
            value={requestsText}
            onChange={(e) => setRequestsText(e.target.value)}
          />
          <label className="sc-label sc-label-next" htmlFor="sc-assignments">
            ユニット外の人の数え先
          </label>
          <p className="sc-hint">「番号: ユニット」でふだん数えるユニット、「番号: 日, 日 ユニット」でその日だけの応援</p>
          <textarea
            id="sc-assignments"
            className="sc-textarea"
            rows={3}
            spellCheck={false}
            placeholder={"S1: B\nS1: 23 A"}
            value={assignmentsText}
            onChange={(e) => setAssignmentsText(e.target.value)}
          />
          <div className="sc-settings">
            <Field label="年月">
              <input type="number" value={settings.year} min={2000} max={2100} onChange={(e) => update("year", Number(e.target.value))} aria-label="年" />
              <input type="number" value={settings.month} min={1} max={12} onChange={(e) => update("month", Number(e.target.value))} aria-label="月" />
            </Field>
            <Field label="人数を見るユニット" hint="空なら全部">
              <input type="text" value={settings.units} placeholder="A, B" onChange={(e) => update("units", e.target.value)} />
            </Field>
            <Field label="公休の基準">
              <input type="number" min={0} value={settings.koukyuBase} onChange={(e) => update("koukyuBase", Number(e.target.value))} /> 日
            </Field>
            <Field label="連続勤務の上限">
              <input type="number" min={1} value={settings.maxConsecutive} onChange={(e) => update("maxConsecutive", Number(e.target.value))} /> 日
            </Field>
            <Field label="夜勤の間隔" hint="入りから次の入りまで">
              <input type="number" min={1} value={settings.minNightGap} onChange={(e) => update("minNightGap", Number(e.target.value))} /> 日以上
            </Field>
            <Field label="夜勤の前日によい札" hint="空なら見ない">
              <input type="text" value={settings.beforeNightTag} onChange={(e) => update("beforeNightTag", e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      <details className="sc-details">
        <summary>記号の表と、毎日必要な人数を変える</summary>
        <div className="sc-details-body">
          <div>
            <label className="sc-label" htmlFor="sc-codes">
              記号の表
            </label>
            <p className="sc-hint">「記号 種類 札…」。札は人数を数えるときの役割（早・リーダーなど）</p>
            <textarea id="sc-codes" className="sc-textarea" rows={12} spellCheck={false} value={codesText} onChange={(e) => setCodesText(e.target.value)} />
          </div>
          <div>
            <label className="sc-label" htmlFor="sc-needs">
              毎日必要な人数
            </label>
            <p className="sc-hint">「各ユニット 札 人数」か「全体 種類 人数 職種に含む文字」</p>
            <textarea id="sc-needs" className="sc-textarea" rows={12} spellCheck={false} value={needsText} onChange={(e) => setNeedsText(e.target.value)} />
          </div>
        </div>
      </details>

      {errors.length > 0 && (
        <ul className="sc-errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {result && (
        <section className="sc-result" aria-label="結果">
          <div className="sc-counts" data-testid="counts">
            {counts.map(([s, n]) => (
              <label key={s} className="sc-count" data-severity={s}>
                <input type="checkbox" checked={shown[s]} onChange={(e) => setShown((v) => ({ ...v, [s]: e.target.checked }))} />
                {s} <b>{n}</b>
              </label>
            ))}
            {days !== monthDays && (
              <span className="sc-warn-days">
                表は {days} 日分、{settings.year}年{settings.month}月は {monthDays} 日
              </span>
            )}
          </div>

          <div className="sc-grid-wrap">
            <table className="sc-grid">
              <thead>
                <tr>
                  <th className="sc-sticky">番号</th>
                  {Array.from({ length: days }, (_, d) => {
                    const w = d < monthDays ? weekday(settings.year, settings.month, d + 1) : -1;
                    const key = dayKey(d + 1);
                    const issues = byCell.get(key);
                    return (
                      <th
                        key={d}
                        className="sc-day"
                        data-key={key}
                        data-week={w === 0 ? "sun" : w === 6 ? "sat" : undefined}
                        data-severity={worst(issues)}
                        data-selected={selected === key ? "" : undefined}
                        title={issues?.map((i) => i.message).join("\n")}
                        onClick={issues ? () => select(key, ".sc-issues") : undefined}
                      >
                        {d + 1}
                        <br />
                        {w >= 0 ? WEEK[w] : ""}
                      </th>
                    );
                  })}
                  <th title="公休の日数（基準との差）">公休</th>
                  <th title="夜勤の回数">夜勤</th>
                  <th title="いちばん長い連続勤務">連勤</th>
                  <th title="リーダーの回数">リ</th>
                  <th title="叶った休み希望 / 出した数">希望</th>
                </tr>
              </thead>
              <tbody>
                {result.roster.staff.map((s, row) => {
                  const sum = result.summaries[row];
                  const diff = sum.koukyu - settings.koukyuBase;
                  return (
                    <tr key={s.id}>
                      {/* 横に送っても番号とユニットが見えるよう、1つの列にまとめて固定する */}
                      <th className="sc-sticky" title={s.role}>
                        {s.id}
                        <small className="sc-unit">{sum.unit === s.unit ? s.unit : `${s.unit}→${sum.unit}`}</small>
                      </th>
                      {s.codes.map((c, d) => {
                        const key = cellKey(s.id, d + 1);
                        const issues = byCell.get(key);
                        return (
                          <Cell
                            key={d}
                            cellKey={key}
                            code={c}
                            def={result.codes.get(c)}
                            severity={worst(issues)}
                            title={issues?.map((i) => i.message).join("\n")}
                            requested={result.requests.has(key)}
                            selected={selected === key}
                            onClick={issues ? () => select(key, ".sc-issues") : undefined}
                          />
                        );
                      })}
                      {/* 基準との差は年間で調整するものなので、違反の色にはしない */}
                      <td className="sc-num">
                        {sum.koukyu}
                        {diff !== 0 && <small className="sc-diff">（{diff > 0 ? `+${diff}` : `−${-diff}`}）</small>}
                      </td>
                      <td className="sc-num">{sum.nights}</td>
                      <td className="sc-num" data-off={sum.maxRun > settings.maxConsecutive ? "under" : undefined}>
                        {sum.maxRun}
                      </td>
                      <td className="sc-num">{sum.leader}</td>
                      <td className="sc-num" data-off={sum.granted < sum.requested ? "under" : undefined}>
                        {sum.requested ? `${sum.granted}/${sum.requested}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tbody className="sc-coverage">
                {result.coverage.map((cov) => (
                  <tr key={`${cov.unit ?? "全体"}-${needLabel(cov.need)}`}>
                    <th className="sc-sticky">
                      {cov.unit ?? "全体"} {needLabel(cov.need)}
                    </th>
                    {cov.counts.map((n, d) => (
                      <td key={d} className="sc-num" data-short={n < cov.need.min ? "" : undefined} title={`${cov.need.min}人必要`}>
                        {n}
                      </td>
                    ))}
                    <td colSpan={5} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sc-hint">
            色の付いたマス（人数が足りない日は日付）を押すと、下の一覧の該当する行が光ります。一覧の行を押すと、表のマスが光ります。
            表の下の段は毎日の人数で、赤は足りない日。右上に点のあるマスは休み希望を出した日。
          </p>

          <ol className="sc-issues" data-testid="issues">
            {visible.length === 0 && <li className="sc-none">表示する指摘はありません</li>}
            {visible.map((i, n) => {
              const key = issueKey(i);
              const first = key !== undefined && byCell.get(key)?.[0] === i;
              return (
                <li
                  key={n}
                  data-severity={i.severity}
                  data-key={first ? key : undefined}
                  data-selected={key !== undefined && key === selected ? "" : undefined}
                >
                  <button type="button" onClick={() => select(key, ".sc-grid")} disabled={!key}>
                    <span className="sc-tag">{i.severity}</span>
                    <span className="sc-rule">{i.rule}</span>
                    {i.message}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="sc-field">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="sc-field-input">{children}</span>
    </label>
  );
}

interface CellProps {
  cellKey: string;
  code: string;
  def?: CodeDef;
  severity?: Severity;
  title?: string;
  requested: boolean;
  selected: boolean;
  onClick?: () => void;
}

function Cell({ cellKey, code, def, severity, title, requested, selected, onClick }: CellProps) {
  return (
    <td
      className="sc-cell"
      data-key={cellKey}
      data-kind={def?.kind ?? (code ? "unknown" : "empty")}
      data-severity={severity}
      data-selected={selected ? "" : undefined}
      data-requested={requested ? "" : undefined}
      title={title}
      onClick={onClick}
    >
      {code}
    </td>
  );
}
