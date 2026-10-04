// メモリの帯。状態は持たず、配置とずれを受け取って描くだけ（記事の中の単体版と、段階つきの図解の両方で使う）
import { FNS, HOT, LINE, ORDER, fnSize, hex, hotEnd, loopLines, place, type Layout } from "./model";

const X0 = 24; // 帯の左端（1バイト = 1単位）
const N_LINES = 8;

interface Props {
  layout: Layout;
  pad: number;
  onLayout: (l: Layout) => void;
  onPad: (p: number) => void;
}

export default function Tape({ layout, pad, onLayout, onPad }: Props) {
  const pos = place(layout, pad);
  const used = new Set<number>();
  const crossings: number[] = [];
  const readouts = HOT.map((k) => {
    const [a, b] = loopLines(k, pos);
    for (let i = a; i <= b; i++) used.add(i);
    for (let i = a + 1; i <= b; i++) crossings.push(i); // ループの中を通る境目
    return { k, n: b - a + 1 };
  });

  return (
    <section className="lab" aria-label="メモリの帯">
      <div className="controls">
        <div className="seg" role="group" aria-label="配置">
          <button aria-pressed={layout === "old"} onClick={() => onLayout("old")}>
            いまの配置（記録 #32）
          </button>
          <button aria-pressed={layout === "new"} onClick={() => onLayout("new")}>
            直した配置（記録 #33）
          </button>
        </div>
        <label className="slider">
          前の関数を伸ばす
          <input type="range" min={0} max={64} step={1} value={pad} onChange={(e) => onPad(+e.target.value)} />
          <output>+{pad} バイト</output>
        </label>
      </div>

      <div className="svgbox">
        <svg viewBox="0 0 560 190" role="img" aria-label="64バイトごとに区切られたメモリと、その上に並ぶ関数">
          {/* 読むかたまり */}
          {Array.from({ length: N_LINES }, (_, i) => (
            <rect key={i} className="band" x={X0 + i * LINE} y={30} width={LINE} height={112} rx={2}
              opacity={used.has(i) ? 1 : 0} />
          ))}
          {/* 熱い区画 */}
          {layout === "new" && (
            <g className="hotbr">
              <path d={`M${X0} 156 v4 H${X0 + hotEnd(pos)} v-4`} />
              <text x={X0} y={172} fontSize={10}>熱い関数の区画（先頭に固定し、64バイトの境目に揃える）</text>
            </g>
          )}
          {/* 関数 */}
          {ORDER.map((k) => {
            const f = FNS[k];
            const fs = Math.min(9.5, (f.size - 10) / (f.label.length * 0.6)); // 名前が箱に収まる文字の大きさ
            return (
              <g key={k} className="fn" style={{ transform: `translate(${X0 + pos[k]}px, 0px)` }}>
                <rect className={`fnrect ${f.hot ? "hot" : "cold"}`} x={0} y={46} width={fnSize(k, pad) - 2} height={70} rx={5} />
                <text className={f.hot ? "ink-hot" : "ink-cold"} x={5} y={62} fontSize={fs.toFixed(2)}>{f.label}</text>
                {f.loop && (
                  <>
                    <rect className="loop" x={f.loop[0]} y={82} width={f.loop[1]} height={26} rx={3} />
                    <text className="loop-ink" x={f.loop[0] + f.loop[1] / 2} y={99} textAnchor="middle" fontSize={9}>ループ</text>
                  </>
                )}
              </g>
            );
          })}
          {/* 境目の点線は箱の上に引く */}
          {Array.from({ length: N_LINES + 1 }, (_, i) => (
            <g key={i} className="grid">
              <line x1={X0 + i * LINE} y1={26} x2={X0 + i * LINE} y2={150} />
              <text x={X0 + i * LINE} y={18} textAnchor="middle" fontSize={10}>{i * LINE}</text>
            </g>
          ))}
          {crossings.map((i) => (
            <g key={i} className="cross">
              <line x1={X0 + i * LINE} y1={78} x2={X0 + i * LINE} y2={112} />
              <text x={X0 + i * LINE} y={130} textAnchor="middle" fontSize={9.5}>↑ ループが境目をまたぐ</text>
            </g>
          ))}
          {/* 箱の上の空きに出す（箱の中だと狭くて切れる） */}
          {pad > 0 && (
            <text className="padlabel" x={X0 + pos.show + 2} y={40} fontSize={9.5}>showBoard が +{pad} バイト伸びた</text>
          )}
        </svg>
      </div>

      <div className="readouts">
        {readouts.map(({ k, n }) => (
          <div key={k} className={`ro ${n > 1 ? "bad" : "good"}`}>
            <span className="name">{FNS[k].role} <code>{FNS[k].label}</code></span>
            <span className="val">置き場所の番地 <b>{hex(pos[k])}</b></span>
            <span className="val">ループ1周で読むかたまり <b>{n}</b> 個{n > 1 ? "（境目をまたいでいる）" : ""}</span>
          </div>
        ))}
      </div>

      <div className="chips" aria-hidden="true">
        <span className="chip">目盛り＝番地（バイト）</span>
        <span className="chip"><span className="sw hot" />熱い関数（実行時間の大半を使う関数）</span>
        <span className="chip"><span className="sw cold" />ほかの関数</span>
        <span className="chip"><span className="sw loop" />何億回も回るループ</span>
        <span className="chip"><span className="sw band" />ループを回すために CPU が読む64バイトのかたまり</span>
      </div>
    </section>
  );
}
