// 模型の計算（画面に依存しない部分）。数値を変えたら、図解の本文の主張と食い違わないか確かめる
export const LINE = 64; // CPU が命令を読むかたまりの大きさ（バイト）
export const BASE = 0x1000; // 番地の見た目の起点

export type Layout = "old" | "new";
export type FnKey = "show" | "inv" | "huge" | "succ";
export interface Fn {
  label: string;
  size: number;
  hot: boolean;
  loop?: [number, number]; // 関数の先頭からの位置と長さ
  role?: string;
}

export const FNS: Record<FnKey, Fn> = {
  show: { label: "showBoard", size: 70, hot: false },
  inv: { label: "nextBoardInvNormal", size: 120, hot: true, loop: [12, 40], role: "手を作る関数" },
  huge: { label: "hugeAlloc", size: 64, hot: false },
  succ: { label: "buildSuccRange", size: 100, hot: true, loop: [10, 40], role: "後退解析の関数" },
};
export const ORDER: FnKey[] = ["show", "inv", "huge", "succ"];
export const HOT: FnKey[] = ["inv", "succ"];

const up = (v: number) => Math.ceil(v / LINE) * LINE;

export function place(layout: Layout, pad: number): Record<FnKey, number> {
  if (layout === "old") {
    // 書いた順に並ぶ。showBoard が pad バイト伸びると、後ろが全部ずれる
    const pos = {} as Record<FnKey, number>;
    let x = 0;
    for (const k of ORDER) {
      pos[k] = x;
      x += FNS[k].size + (k === "show" ? pad : 0);
    }
    return pos;
  }
  // 熱い区画を先頭に。熱い関数は64バイトの区切りに揃える
  const inv = 0;
  const succ = up(inv + FNS.inv.size);
  const show = up(succ + FNS.succ.size);
  return { inv, succ, show, huge: show + FNS.show.size + pad };
}

export function fnSize(k: FnKey, pad: number): number {
  return FNS[k].size + (k === "show" ? pad : 0);
}

// ループが乗るかたまりの番号の範囲 [最初, 最後]
export function loopLines(k: FnKey, pos: Record<FnKey, number>): [number, number] {
  const [off, len] = FNS[k].loop!;
  const s = pos[k] + off;
  return [Math.floor(s / LINE), Math.floor((s + len - 1) / LINE)];
}

export const hex = (v: number) => "0x" + (BASE + v).toString(16);

// 熱い区画の終わり（直した配置でだけ意味がある）
export function hotEnd(pos: Record<FnKey, number>): number {
  return up(pos.succ + FNS.succ.size);
}
