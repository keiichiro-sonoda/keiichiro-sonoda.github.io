# CLAUDE.md

このリポジトリで作業するときの取り決め。中身は GitHub Pages の個人サイト（Astro。動く部分は React）。

## いちばん大事なこと

**`gh-pages` に push すると、GitHub Actions がビルドして公開する。公開リポジトリに出したものは、消しても取り戻せない。**
（ビルドしたサイトに出なくても、リポジトリに push した時点でソースは誰でも読める）

- push の前に `python3 tools/publish_lint.py` が機械で止めるもの（鍵・個人や機械を特定する情報・
  公開しない言葉・画像の未確認など）は [`PUBLISHING.md`](PUBLISHING.md) にある。
  GitHub Actions も、公開する直前のビルドの成果物に同じ検査（`--dir dist`）をかける
- 機械で見られない観点は、スキル `review-before-push` で読む（観点の本文は [`docs/review-checklist.md`](docs/review-checklist.md)）
- **push は指示されるまでしない。**`--no-verify` で検査を飛ばさない。検査が間違って止めたなら検査のほうを直す
- **公開しない言葉の一覧（`~/.config/publish-lint/deny.txt`）の中身を、このリポジトリのどこにも書かない**
  （CLAUDE.md・コミットメッセージ・テストも含む）。一覧そのものが漏れる

## 構成

| 場所 | 中身 |
|---|---|
| `src/content/posts/` | 記事（Markdown / MDX）。ファイル名は `YYYY-MM-DD-<名前>.mdx`。URL は Jekyll 時代と同じ `/YYYY/MM/DD/<名前>.html`（`src/lib/posts.ts`） |
| `src/pages/explainers/<名前>/` | 図解のページ。動く部分は `src/components/<名前>/` の React の部品 |
| `src/layouts/`・`src/styles/global.css` | サイト共通の枠と色（ライトとダーク） |
| `src/components/legacy/`・`src/legacy/`・`public/legacy/` | Jekyll 時代の作品。書き直さずに動かしている（ページ丸ごとの HTML は iframe、ノートブックは本文に差し込む） |
| `public/` | **そのまま全部公開される**。古い作品の JS・CSS など |
| `tools/vendor.mjs` | npm で入れたライブラリを `public/vendor/` に写す（`npm run dev` / `build` の前に自動で走る。生成物は git に入れない） |
| `tools/publish_lint.py`・`.githooks/` | 公開前の検査 |
| `.github/workflows/deploy.yml` | ビルド → 成果物の検査 → 公開 |
| `docs/` | 図解の作り方・公開前レビューの観点 |

`src/pages/` と `public/` 以外は公開されるサイトに出ない（ただしリポジトリは公開なので、ソースとしては読める）。

```bash
npm ci            # 初回（node_modules を package-lock.json どおりに入れる）
npm run dev       # http://localhost:4321/ 。保存すると画面がすぐ変わる
npm run check     # 型の検査
npm run build     # dist/ に出力
```

- **外部の CDN から `<script src>` で読まない。**npm で版を固定して入れる（React の部品なら import、
  素の `<script>` なら `tools/vendor.mjs` の表に足して `/vendor/` から読む）。理由は `tools/vendor.mjs` の冒頭
- 記事を足したら、トップの一覧に自動で出る。図解を足したら、紹介の記事を1本置く

## 図解を作るとき

スキル `make-explainer` を使う。観点の本文は [`docs/explainer-guide.md`](docs/explainer-guide.md) にある。
**このリポジトリの図解で、実際に読者から指摘されたこと**（文字の途切れ、前提知識の不足、
見るべき部分が分からない図、直した状態なのに直っていないように見える例など）を全部そこに書いてある。
作る前に読み、仕上げる前に、そこにある確認を全部やる。

## 文書の書き方

- 本人への説明・報告は日本語で書く
- 内輪の呼び名（手元の機械の呼び名など）を公開物に書かない。消すときは「1台の構成」を
  「環境全体の性質」に広げて書き直さない
- 同じ内容を2か所に書かない。スキルは `docs/` を指すだけにする（片方が腐って気づけなくなる）

## コミット

- メッセージは日本語。何をしたかと、なぜそうしたかを書く
- `git add -A` を使わない。触ったファイルを名指しする
- `Co-Authored-By: Claude ...` の行は付けてよい。`Claude-Session:` の URL 行は付けない
- 最初に一度だけ `git config core.hooksPath .githooks`（push のたびに検査が走る）
