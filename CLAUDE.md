# CLAUDE.md

このリポジトリで作業するときの取り決め。中身は GitHub Pages の個人サイト（Jekyll、テーマは minima）。

## いちばん大事なこと

**`gh-pages` に push した瞬間に公開される。公開リポジトリに出したものは、消しても取り戻せない。**

- push の前に `python3 tools/publish_lint.py` が機械で止めるもの（鍵・個人や機械を特定する情報・
  公開しない言葉・画像の未確認など）は [`PUBLISHING.md`](PUBLISHING.md) にある
- 機械で見られない観点は、スキル `review-before-push` で読む（観点の本文は [`docs/review-checklist.md`](docs/review-checklist.md)）
- **push は指示されるまでしない。**`--no-verify` で検査を飛ばさない。検査が間違って止めたなら検査のほうを直す
- **公開しない言葉の一覧（`~/.config/publish-lint/deny.txt`）の中身を、このリポジトリのどこにも書かない**
  （CLAUDE.md・コミットメッセージ・テストも含む）。一覧そのものが漏れる

## 構成

| 場所 | 中身 |
|---|---|
| `_posts/` | 記事。多くは `_includes/` の HTML を読み込むだけの短い Markdown |
| `explainers/<名前>/index.html` | 図解。1枚で完結した HTML。**front matter を付けない**（付けると Jekyll が minima の枠に入れて崩れる） |
| `tools/`・`.githooks/` | 公開前の検査（`_config.yml` の `exclude` で公開しない） |
| `docs/` | 図解の作り方・公開前レビューの観点（公開しない） |

新しい図解を足したら、`_posts/` に紹介の記事を1本置いて、トップの一覧から辿れるようにする。

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
