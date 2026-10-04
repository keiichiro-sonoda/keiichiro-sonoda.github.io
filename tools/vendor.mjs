// 外部の CDN から読んでいたライブラリを、npm で入れた版から public/vendor/ に写す（dev と build の前に自動で走る）。
//
// なぜ: CDN の <script src> は、そのドメインの今の持ち主に、このサイトの上で任意のコードを実行させるのと同じ。
// polyfill.io は 2024 年に売られ、読み込んでいたサイトに悪意のあるコードを配った。
// 版は package.json で固定し（--save-exact）、中身は package-lock.json の integrity で固定される。
//
// public/vendor/ は生成物なので git に入れない（.gitignore）。足すときは下の表に1行足し、
// ページからは /vendor/<名前>/... で読む。要らないファイルまで写さない（MathJax は丸ごとだと 70MB を超える）。
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vendor");

// [出力先の名前, node_modules の中のパッケージ, 写すパス（パッケージの中の相対パス）]
const VENDOR = [
  ["chart.js", "chart.js", ["dist/chart.umd.min.js", "LICENSE.md"]],
  // 株価予測のノートブックと不偏分散（MathJax 3）。tex-mml-chtml.js が、必要に応じて input/ や output/ の下を読みに来る
  ["mathjax3", "mathjax3", ["LICENSE", "es5/tex-mml-chtml.js", "es5/input", "es5/output/chtml", "es5/ui", "es5/a11y", "es5/adaptors"]],
];

// 表と版が前回と同じなら何もしない。npm run dev の最中に build を走らせたとき、写し直すと
// dev サーバ（Vite）が覚えている public/ の一覧が古くなり、/vendor/ の一部が 404 になるため
const stamp = JSON.stringify(
  VENDOR.map(([name, pkg, paths]) => [
    name,
    JSON.parse(readFileSync(join(root, "node_modules", pkg, "package.json"), "utf8")).version,
    paths,
  ]),
);
const stampFile = join(out, ".stamp");
if (existsSync(stampFile) && readFileSync(stampFile, "utf8") === stamp) {
  console.log("vendor: public/vendor/ は最新");
  process.exit(0);
}

rmSync(out, { recursive: true, force: true });
for (const [name, pkg, paths] of VENDOR) {
  for (const p of paths) {
    const src = join(root, "node_modules", pkg, p);
    if (!existsSync(src)) {
      console.error(`vendor: ${pkg}/${p} が無い（npm ci をやり直すか、表を直す）`);
      process.exit(1);
    }
    const dst = join(out, name, p);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true });
  }
}
writeFileSync(stampFile, stamp);
console.log(`vendor: ${VENDOR.map(([n]) => n).join(", ")} を public/vendor/ に写した`);
