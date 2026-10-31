// 勤務表のチェッカー。貼り付けた表を決まりに照らして色を付け、直す案や0から組んだ案も出す
// 判定は軽いので画面のスレッドで、直す・組む（局所探索）は Worker で回す
// 貼り付けた中身はこのページの中だけで扱い、送らない・保存しない（記事のページで通信そのものも止めている）
import { useMemo, useState, type ReactNode } from "react";
import { DEFAULT_CODES_TEXT, parseCodes, type CodeDef, type CodeTable } from "./engine/codes";
import { check, SEVERITIES, scoreOf, type Issue, type Score, type Severity, type StaffAttr } from "./engine/check";
import {
  DEFAULT_LEVELS,
  DEFAULT_NEEDS_TEXT,
  DEFAULT_RULES,
  LEVELS,
  needLabel,
  parseNeeds,
  RULE_HINTS,
  RULE_KEYS,
  type Level,
  type RuleKey,
  type Rules,
} from "./engine/rules";
import { daysInMonth, makeSample, SAMPLE_MONTH, SAMPLE_YEAR, weekday } from "./engine/sample";
import { inferAttrs, toTableText, type SolveMode } from "./engine/solve";
import {
  attributesText,
  parseAssignments,
  parseAttributes,
  parseRequests,
  parseTable,
  type Assignment,
  type Request,
  type Roster,
} from "./engine/table";
import { useSolver } from "./useSolver";
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
const scoreText = (s: Score) => `必須の違反 ${s.hard}・罰点 ${s.soft}`;

interface CheckInput {
  roster: Roster;
  codes: CodeTable;
  rules: Rules;
  requests: Request[];
  assignments: Assignment[];
  attrs: Map<string, StaffAttr>;
}

function checkRoster(input: CheckInput, roster: Roster) {
  const checked = check(roster, input.codes, input.rules, input.requests, input.assignments, input.attrs);
  return {
    roster,
    codes: input.codes,
    requests: new Set(input.requests.map((r) => cellKey(r.id, r.day))),
    score: scoreOf(checked.issues),
    ...checked,
  };
}

export default function ShiftChecker() {
  const [tableText, setTableText] = useState("");
  const [requestsText, setRequestsText] = useState("");
  const [assignmentsText, setAssignmentsText] = useState("");
  const [codesText, setCodesText] = useState(DEFAULT_CODES_TEXT);
  const [needsText, setNeedsText] = useState(DEFAULT_NEEDS_TEXT);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [levels, setLevels] = useState<Record<RuleKey, Level>>(DEFAULT_LEVELS);
  const [attrsText, setAttrsText] = useState("");
  // 架空の表（23人・30日）で、1秒に十数万手を試せる。人が多い表ほど遅くなるので、余裕を見て10秒にする
  const [seconds, setSeconds] = useState(10);
  const [shown, setShown] = useState<Record<Severity, boolean>>({ 違反: true, 注意: true, 参考: false });
  const [selected, setSelected] = useState<string>();
  const [copied, setCopied] = useState(false);
  const solver = useSolver();
  // 案を出したときの入力。入力を変えたら、その案は古いので見せない
  const [job, setJob] = useState<{ mode: SolveMode; key: string }>();
  // 案を出したあと、案を捨てずに元の表を見比べる
  const [viewOriginal, setViewOriginal] = useState(false);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  const loadSample = () => {
    const s = makeSample();
    setTableText(s.table);
    setRequestsText(s.requests);
    setAssignmentsText(s.assignments);
    setSettings({ ...INITIAL_SETTINGS, units: s.units.join(", "), koukyuBase: s.koukyuBase });
    setSelected(undefined);
  };
  const clear = () => {
    setTableText("");
    setRequestsText("");
    setAssignmentsText("");
    setSelected(undefined);
  };

  const inputsKey = [tableText, codesText, needsText, requestsText, assignmentsText, attrsText, JSON.stringify(settings), JSON.stringify(levels)].join("\u0001");

  const { errors, input } = useMemo(() => {
    const table = parseTable(tableText);
    const codes = parseCodes(codesText);
    const needs = parseNeeds(needsText);
    const requests = parseRequests(requestsText);
    const assignments = parseAssignments(assignmentsText);
    const attrs = parseAttributes(attrsText);
    const errors = [
      ...(tableText.trim() ? table.errors : []),
      ...codes.errors,
      ...needs.errors,
      ...requests.errors,
      ...assignments.errors,
      ...attrs.errors,
    ];
    if (!tableText.trim() || !table.roster) return { errors, input: undefined };
    const rules: Rules = {
      needs: needs.needs,
      levels,
      units: settings.units.split(/[,、\s]+/).filter(Boolean),
      koukyuBase: settings.koukyuBase,
      maxConsecutive: settings.maxConsecutive,
      minNightGap: settings.minNightGap,
      beforeNightTag: settings.beforeNightTag.trim(),
    };
    return {
      errors,
      input: { roster: table.roster, codes: codes.table, rules, requests: requests.requests, assignments: assignments.assignments, attrs: attrs.attrs },
    };
  }, [tableText, codesText, needsText, requestsText, assignmentsText, attrsText, settings, levels]);

  // 案があれば案を、無ければ貼った表を見せる
  const fresh = job?.key === inputsKey;
  const proposal: Roster | undefined = useMemo(
    () =>
      input && fresh && solver.grid
        ? { days: solver.grid[0]?.length ?? 0, staff: input.roster.staff.map((s, i) => ({ ...s, codes: solver.grid![i] })) }
        : undefined,
    [input, fresh, solver.grid],
  );

  const original = useMemo(() => input && checkRoster(input, input.roster), [input]);
  const proposed = useMemo(() => input && proposal && checkRoster(input, proposal), [input, proposal]);
  const result = proposed && !viewOriginal ? proposed : original;
  const showingProposal = result === proposed && proposed !== undefined;

  // 修正案で変えたマス（元の記号と案の記号）。案を見ているときも、元の表を見ているときも印を付ける
  const changes = new Map<string, { id: string; day: number; from: string; to: string }>();
  if (proposal && input && job?.mode === "fix") {
    proposal.staff.forEach((s, i) =>
      s.codes.forEach((to, d) => {
        const from = input.roster.staff[i].codes[d];
        if (to !== from) changes.set(cellKey(s.id, d + 1), { id: s.id, day: d + 1, from, to });
      }),
    );
  }
  // 案で直った指摘と、案で新しく出た指摘
  const issueId = (i: Issue) => `${i.rule}|${i.message}`;
  const diff = useMemo(() => {
    if (!original || !proposed || job?.mode !== "fix") return undefined;
    const before = new Set(original.issues.map(issueId));
    const after = new Set(proposed.issues.map(issueId));
    return { fixed: original.issues.filter((i) => !after.has(issueId(i))), added: proposed.issues.filter((i) => !before.has(issueId(i))) };
  }, [original, proposed, job?.mode]);

  const startSolve = (mode: SolveMode) => {
    if (!input) return;
    setJob({ mode, key: inputsKey });
    setViewOriginal(false);
    setSelected(undefined);
    setCopied(false);
    solver.start({ ...input, mode, year: settings.year, month: settings.month, seed: Math.floor(Math.random() * 2 ** 31) }, seconds);
  };
  const closeProposal = () => {
    solver.discard();
    setJob(undefined);
  };
  const adopt = () => {
    if (!proposal) return;
    setTableText(toTableText(proposal));
    closeProposal();
  };
  const copy = () => {
    if (!proposal) return;
    void navigator.clipboard.writeText(toTableText(proposal)).then(() => setCopied(true));
  };
  const fillAttrs = () => {
    if (input) setAttrsText(attributesText(inferAttrs(input.roster, input.codes, settings.koukyuBase)));
  };

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
          <p className="sc-hint">1行に1人「番号: 日, 日」。必ず休みにする日は「15!」</p>
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
        <summary>決まりの重み・記号の表・毎日必要な人数を変える</summary>
        <div className="sc-details-body">
          <div>
            <span className="sc-label">決まりの重み</span>
            <p className="sc-hint">必須を破らないことを最優先し、そのうえで高・中・低の順に守ります。人数の重みは「毎日必要な人数」の行の終わりに書きます</p>
            <div className="sc-levels">
              {RULE_KEYS.map((k) => (
                <label key={k} className="sc-field">
                  <span>
                    {k}
                    <small>{RULE_HINTS[k]}</small>
                  </span>
                  <select value={levels[k]} aria-label={`${k}の重み`} onChange={(e) => setLevels((v) => ({ ...v, [k]: e.target.value as Level }))}>
                    {LEVELS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
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
            <p className="sc-hint">「各ユニット 札 人数 重み」か「全体 種類 人数 職種に含む文字 重み」</p>
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
            <span className="sc-score" data-testid="score">
              {scoreText(result.score)}
            </span>
            {days !== monthDays && (
              <span className="sc-warn-days">
                表は {days} 日分、{settings.year}年{settings.month}月は {monthDays} 日
              </span>
            )}
          </div>

          <div className="sc-solve">
            <div className="sc-buttons">
              <button type="button" onClick={() => startSolve("fix")} disabled={solver.running}>
                修正案を出す
              </button>
              <button type="button" onClick={() => startSolve("generate")} disabled={solver.running}>
                {settings.year}年{settings.month}月を0から組む
              </button>
              {solver.running && (
                <button type="button" onClick={solver.stop}>
                  止める
                </button>
              )}
              <label className="sc-seconds">
                考える時間
                <input type="number" min={1} max={60} value={seconds} onChange={(e) => setSeconds(Math.max(1, Number(e.target.value) || 1))} /> 秒
              </label>
            </div>
            <p className="sc-hint">
              修正案は、いまの表をなるべく少しだけ書き換えて、決まりに合わないところを減らします。
              0から組むは、貼った表を手本に（職員・ユニット・その人が使っている記号を読み取って）年月の月を組みます。休み希望はその月のものを書いてください。
            </p>
            {solver.running && solver.progress && (
              <p className="sc-progress" data-testid="solve-progress">
                考えています… {(solver.progress.elapsed / 1000).toFixed(1)}秒、いちばん良い案は {scoreText(solver.progress.best.score)}
              </p>
            )}
            {solver.error && (
              <p className="sc-errors" role="alert">
                {solver.error}
              </p>
            )}
            {proposed && original && job && (
              <div className="sc-proposal" role="status" data-testid="proposal">
                <p>
                  {job.mode === "fix" ? (
                    <>
                      <b>修正案</b>：元の表 {scoreText(original.score)} → 案 {scoreText(proposed.score)}、変えたマス {changes.size}
                    </>
                  ) : (
                    <>
                      <b>
                        {settings.year}年{settings.month}月の案
                      </b>
                      ：{scoreText(proposed.score)}
                    </>
                  )}
                </p>
                <div className="sc-buttons" role="group" aria-label="表示する表">
                  <button type="button" aria-pressed={!viewOriginal} onClick={() => setViewOriginal(false)}>
                    案を表示
                  </button>
                  <button type="button" aria-pressed={viewOriginal} onClick={() => setViewOriginal(true)}>
                    元の表を表示
                  </button>
                </div>
                <p className="sc-hint">
                  {job.mode === "fix"
                    ? showingProposal
                      ? "点線の枠が変えたマス。小さい取り消し線の記号が元の記号です。"
                      : "元の表を表示しています。点線の枠が、案で変わるマスです。"
                    : showingProposal
                      ? "組んだ案を表示しています。"
                      : "手本にした表を表示しています。"}
                </p>
                {job.mode === "fix" && changes.size > 0 && (
                  <details className="sc-changes" open>
                    <summary>変えたマス（{changes.size}）</summary>
                    <ol data-testid="changes">
                      {[...changes].map(([key, c]) => {
                        const w = c.day <= monthDays ? weekday(settings.year, settings.month, c.day) : -1;
                        return (
                          <li key={key} data-selected={selected === key ? "" : undefined}>
                            <button type="button" onClick={() => select(key, ".sc-grid")}>
                              <span className="sc-num">{c.id}</span> {c.day}日{w >= 0 ? `（${WEEK[w]}）` : ""}{" "}
                              <s className="sc-was-text">{c.from || "空"}</s> → <b>{c.to}</b>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                )}
                {diff && (
                  <details className="sc-changes">
                    <summary>
                      直った指摘（{diff.fixed.length}）・新しく出た指摘（{diff.added.length}）
                    </summary>
                    <ul className="sc-diff-issues" data-testid="issue-diff">
                      {diff.fixed.map((i) => (
                        <li key={`f${issueId(i)}`} data-severity={i.severity}>
                          <span className="sc-mark">直った</span>
                          <span className="sc-tag">{i.severity}</span> {i.message}
                        </li>
                      ))}
                      {diff.added.map((i) => (
                        <li key={`a${issueId(i)}`} data-severity={i.severity}>
                          <span className="sc-mark sc-mark-new">新しく出た</span>
                          <span className="sc-tag">{i.severity}</span> {i.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="sc-buttons">
                  <button type="button" onClick={adopt}>
                    この案を採用する
                  </button>
                  <button type="button" onClick={copy}>
                    {copied ? "コピーしました" : "案をコピー（Excel に貼れる）"}
                  </button>
                  <button type="button" onClick={closeProposal}>
                    案を捨てる
                  </button>
                </div>
              </div>
            )}
            <details className="sc-details">
              <summary>職員ごとに使える記号（自動で直す・組むとき）</summary>
              <p className="sc-hint">
                1行に1人「番号: 日 早 遅 夜 公休14」。書いていない人は、表でその人が使っている記号だけを使います。「公休N」はその人の公休の基準（パートなど）
              </p>
              <textarea
                id="sc-attrs"
                aria-label="職員ごとに使える記号"
                className="sc-textarea"
                rows={5}
                spellCheck={false}
                placeholder={"A8: 日 休\nN1: 日 夜 明 休"}
                value={attrsText}
                onChange={(e) => setAttrsText(e.target.value)}
              />
              <div className="sc-buttons">
                <button type="button" onClick={fillAttrs}>
                  表から読み取って書き出す
                </button>
              </div>
            </details>
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
                            was={showingProposal ? changes.get(key)?.from : undefined}
                            will={showingProposal ? undefined : changes.get(key)?.to}
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
                    <span className="sc-rule">
                      {i.rule}・{i.level}
                    </span>
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
  // 修正案で変わるマス。案を表示中は元の記号（was）、元の表を表示中は案の記号（will）
  was?: string;
  will?: string;
  code: string;
  def?: CodeDef;
  severity?: Severity;
  title?: string;
  requested: boolean;
  selected: boolean;
  onClick?: () => void;
}

function Cell({ cellKey, was, will, code, def, severity, title, requested, selected, onClick }: CellProps) {
  return (
    <td
      className="sc-cell"
      data-key={cellKey}
      data-kind={def?.kind ?? (code ? "unknown" : "empty")}
      data-severity={severity}
      data-selected={selected ? "" : undefined}
      data-requested={requested ? "" : undefined}
      data-changed={was !== undefined || will !== undefined ? "" : undefined}
      title={[title, was !== undefined && `元は「${was || "空"}」`, will !== undefined && `案では「${will}」`].filter(Boolean).join("\n") || undefined}
      onClick={onClick}
    >
      {was !== undefined && <s className="sc-was">{was || "空"}</s>}
      {code}
    </td>
  );
}
