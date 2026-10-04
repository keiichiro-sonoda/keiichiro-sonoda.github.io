import { useCallback, useEffect, useRef, useState } from "react";
import type { Layout } from "./model";

// 帯の状態と「▶ ずれを動かす」。動きを減らす設定の人には、往復させずに 24 バイトの状態だけ見せる
export function useTapeState(initial: { layout: Layout; pad: number }) {
  const [layout, setLayout] = useState<Layout>(initial.layout);
  const [pad, setPadRaw] = useState(initial.pad);
  const [playing, setPlaying] = useState(false);
  const dir = useRef(1);

  useEffect(() => {
    if (!playing) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPadRaw(24);
      setPlaying(false);
      return;
    }
    const id = setInterval(() => {
      setPadRaw((p) => {
        let n = p + dir.current * 2;
        if (n >= 64) [n, dir.current] = [64, -1];
        if (n <= 0) [n, dir.current] = [0, 1];
        return n;
      });
    }, 90);
    return () => clearInterval(id);
  }, [playing]);

  // 手で動かしたら往復は止める
  const setPad = useCallback((p: number) => {
    setPlaying(false);
    setPadRaw(p);
  }, []);

  return { layout, setLayout, pad, setPad, playing, setPlaying };
}
