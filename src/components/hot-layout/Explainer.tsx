// 段階つきの図解。段階を選ぶと、帯の配置とずれがその段階の状態に切り替わる
import { useState, type ReactNode } from "react";
import Tape from "./Tape";
import { useTapeState } from "./useTapeState";
import { FNS, HOT, hex, place, type Layout } from "./model";
import "./hot-layout.css";

interface Step {
  layout: Layout;
  pad: number;
  h: string;
  body: ReactNode;
}

function AddrTable() {
  const pads = [0, 8, 24, 40, 100];
  return (
    <div className="tablebox">
      <table>
        <thead>
          <tr>
            <th>熱い関数</th>
            {pads.map((p) => (
              <th key={p}>いまの配置<br />詰め物 {p} バイト</th>
            ))}
            <th>直した配置<br />詰め物がいくつでも</th>
          </tr>
        </thead>
        <tbody>
          {HOT.map((k) => {
            const o0 = place("old", 0)[k];
            return (
              <tr key={k}>
                <td>{FNS[k].role}</td>
                {pads.map((p) => {
                  const o = place("old", p)[k];
                  return <td key={p} className={o === o0 ? "same" : "moved"}>{hex(o)}</td>;
                })}
                <td className="same">{hex(place("new", 0)[k])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const STEPS: Step[] = [
  {
    layout: "old", pad: 0, h: "触っていない部分が、0.63秒遅くなった",
    body: (<>
      <p><span className="big">+0.63 秒</span>（区間 +0.35〜+0.90 秒）</p>
      <p>記録 #32 では、<b>全探索</b>の中の関数を1つだけ書き換えました。<b>後退解析</b>のほうは1文字も変えていません。それなのに門番で比べると、後退解析の「手を作って番号に直す工程」が平均 0.63 秒遅くなりました。区間が 0 をまたがないので、偶然とは言いにくい差です。</p>
      <p>調べると、後退解析で CPU が実行する命令は、前とまったく同じでした。違っていたのは、<b>関数がメモリのどこに置かれたか</b>だけです。</p>
    </>),
  },
  {
    layout: "old", pad: 0, h: "関数は、書いた順に一列に並ぶ",
    body: (<>
      <p>C のプログラムをコンパイルすると、関数はおおむね書いた順に、メモリの上に一列に並びます。上の帯がそれで、目盛りはバイト単位の番地です（実物より単純にしてあります）。</p>
      <p>オレンジ色は<b>熱い関数</b>、つまり実行時間の大半を使う関数です。ここでは「手を作る関数」と「後退解析の関数」の2つです。黄色の部分は、その中で何億回も回るループです。</p>
    </>),
  },
  {
    layout: "old", pad: 24, h: "前の関数が伸びると、後ろが全部ずれる",
    body: (<>
      <p>前のほうにある関数（ここでは <code>showBoard</code>）を書き換えて、24バイト長くしました。すると、<b>中身を触っていない後ろの関数まで、全部が24バイトずつ後ろにずれます。</b>番地の数字も変わっています。</p>
      <p>帯の上のつまみを動かして、ずれ方を確かめてみてください。</p>
    </>),
  },
  {
    layout: "old", pad: 0, h: "CPU は、64バイトのかたまりで読む",
    body: (<>
      <p>CPU は命令をメモリから1バイトずつ読むのではなく、<b>64バイトのかたまり</b>でまとめて取ってきます。帯の点線がかたまりの境目で、緑の枠が、熱いループを回すために読むかたまりです。</p>
      <p>いまは2つのループとも、1つのかたまりの中に収まっています。ループを1周回すのに、かたまりを1個読めば済みます。</p>
      <p>見るのは<b>黄色のループが点線をまたぐかどうか</b>です。オレンジの箱（関数全体）は点線をまたいでいても数えません。図を簡単にするため、何億回も回るループの部分だけを数えています。またいだときは、赤い線と「ループが境目をまたぐ」が出ます。</p>
    </>),
  },
  {
    layout: "old", pad: 10, h: "ずれ方しだいで、境目をまたぐ",
    body: (<>
      <p>前の関数を10バイト伸ばすと、手を作る関数のループが境目をまたぎ、<b>1周ごとにかたまりを2個</b>読むことになりました。後退解析の関数のループは、1個のままです。</p>
      <p>伸ばす量が6バイトか7バイトかの違いだけでも、またぐかどうかが変わります。「▶ ずれを動かす」を押すと、ずれ方に応じて、どちらのループがまたぐかが入れ替わるのが見えます。<b>どれが得をしてどれが損をするかは、ずれ方しだいで、前もって分かりません。</b>ループは何億回も回るので、小さな差が積み上がります。</p>
      <p>記録 #32 で後退解析が遅くなったのは、こうした置き場所の違いのせいだと考えています（実際の CPU では、ほかの仕組みも番地の影響を受けます）。</p>
    </>),
  },
  {
    layout: "new", pad: 0, h: "記録 #33：熱い関数を先頭にまとめ、境目に揃える",
    body: (<>
      <p>記録 #33 では、熱い関数を<b>専用の区画にまとめて先頭に置き</b>、それぞれの始まりを<b>64バイトの境目に揃えます</b>。ほかの関数はその後ろに回します。</p>
      <p>この状態でつまみを動かしても、ずれるのは後ろのほかの関数だけで、熱い関数は1バイトも動きません。下の「読むかたまり」の数も変わりません。「▶ ずれを動かす」で確かめてみてください。</p>
      <p>この模型では、揃えた結果、2つのループともかたまり1個に収まりました。⚠️ ただし、これは<b>たまたま</b>です。実物では、関数の始まりを揃えても、ループが関数の中のどこにあるかによっては境目をまたいだままになります。<b>#33 が保証するのは「速くなること」ではなく「ほかの変更で動かないこと」</b>です。だから門番では、速くなるとも遅くなるとも予想を立てていません。</p>
    </>),
  },
  {
    layout: "new", pad: 24, h: "効いたかどうかの確かめ方",
    body: (<>
      <p>効いているかどうかは、時間を測らなくても<b>番地で</b>確かめられます。熱くない場所に、大きさの違う「詰め物」を足した版をいくつか作って、熱い関数の番地を比べます。</p>
      <AddrTable />
      <p className="note">この表は上の模型で計算した値です。実際の検査では、作ったプログラムから関数の番地を読み出して比べ、自動のテストにします。</p>
    </>),
  },
  {
    layout: "new", pad: 0, h: "止められる範囲と、なぜ大事か",
    body: (<>
      <p><b>ほかの関数を変えたとき</b>：熱い関数は1バイトも動きません。#33 はこれを保証します。</p>
      <p><b>熱い関数そのものを変えたとき</b>：後ろの熱い関数はずれます。ただし境目に揃えてあるので、ずれは64バイト単位になり、かたまりの境目との位置関係は保たれます。そのほかの仕組みの当たり方までは保証できません。</p>
      <p>このプロジェクトに残っている改善は、1回あたり1秒前後かそれ以下のものが多くなっています。置き場所のぶれ（±0.5秒前後）を止めておかないと、改善が効いたのか、置き場所がたまたま良くなっただけなのかを、見分けられません。</p>
    </>),
  },
];

export default function Explainer() {
  const t = useTapeState(STEPS[0]);
  const [cur, setCur] = useState(0);
  const go = (i: number) => {
    const n = Math.max(0, Math.min(STEPS.length - 1, i));
    setCur(n);
    t.setLayout(STEPS[n].layout);
    t.setPad(STEPS[n].pad);
  };
  const s = STEPS[cur];

  return (
    <div className="hl">
      <Tape layout={t.layout} pad={t.pad} onLayout={t.setLayout} onPad={t.setPad} />
      <section className="story" aria-live="polite">
        <nav className="steps" aria-label="段階">
          {STEPS.map((st, i) => (
            <button key={i} title={st.h} aria-label={`${i + 1}: ${st.h}`}
              aria-current={i === cur ? "step" : undefined} onClick={() => go(i)}>
              {i + 1}
            </button>
          ))}
        </nav>
        <div className="scene">
          <h2>{s.h}</h2>
          {s.body}
        </div>
        <div className="nav">
          <button onClick={() => go(cur - 1)} disabled={cur === 0}>← 前へ</button>
          <button className="primary" onClick={() => go(cur + 1)} disabled={cur === STEPS.length - 1}>次へ →</button>
          <button onClick={() => t.setPlaying(!t.playing)}>{t.playing ? "■ 止める" : "▶ ずれを動かす"}</button>
        </div>
      </section>
    </div>
  );
}
