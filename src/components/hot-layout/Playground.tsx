// 記事の中に置く単体版。段階の説明は無く、帯を自由に触れるだけ
import Tape from "./Tape";
import { useTapeState } from "./useTapeState";
import "./hot-layout.css";

export default function Playground() {
  const t = useTapeState({ layout: "old", pad: 0 });
  return (
    <div className="hl">
      <Tape layout={t.layout} pad={t.pad} onLayout={t.setLayout} onPad={t.setPad} />
      <div className="nav">
        <button onClick={() => t.setPlaying(!t.playing)}>{t.playing ? "■ 止める" : "▶ ずれを動かす"}</button>
      </div>
    </div>
  );
}
