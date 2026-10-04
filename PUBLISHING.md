# 公開する前の検査

このリポジトリは GitHub Pages で、`gh-pages` に push すると GitHub Actions がビルドして公開する。
リポジトリ自体も公開なので、push した時点でソースは誰でも読める。
公開リポジトリに一度出したものは、あとから消しても取り戻せない
（履歴・fork・キャッシュ・アーカイブに残る）。
そこで push の前に、**取り戻せない種類のものだけ**を機械で止める（[`tools/publish_lint.py`](tools/publish_lint.py)）。

| | 止めるもの |
|---|---|
| S1 | 鍵・トークンらしき文字列 |
| S2 | ユーザ名を含む絶対パス・メールアドレス・IP アドレス |
| S3 | 公開しない言葉（手元にだけ置く一覧） |
| S4 | 鍵や `.env`、ビルドの出力・npm の中身（`dist/`・`node_modules/`・`public/vendor/` など）のファイル |
| S5 | 中身を機械で読めないファイル（画像など）。目で見てから登録したものだけ通す |
| S6 | コミットメッセージの、会話ログへのポインタ（`Claude-Session:` の行） |
| S7 | 外部のドメインから読み込むスクリプト・スタイル（ビルドの成果物だけ。許すのは Google Fonts の CSS だけ） |

誤字・説明の誤り・デザインは見ない。直して push し直せば済むものを混ぜると、鳴っても押し切る癖がつく。

## 最初に一度だけ

```bash
git config core.hooksPath .githooks
```

これで `git push` のたびに検査が走る。フックはリポジトリの `.githooks/pre-push` をそのまま実行するので、
フックを直せばすぐ効く（`.git/hooks` へ写す方式だと、写した時点のまま古くなる）。

**公開しない言葉の一覧**を、リポジトリの外に置く（1行に1語。`#` で始まる行はコメント）。

```bash
mkdir -p ~/.config/publish-lint && $EDITOR ~/.config/publish-lint/deny.txt
```

手元の機械の呼び名、ローカルのユーザ名、公開していないリポジトリの名前など、外に出したくない言葉を書く。
**一覧をこのリポジトリに入れないこと**（一覧そのものが公開される）。一覧が無いと、検査は通さずに止まる。

## 使い方

```bash
python3 tools/publish_lint.py                 # origin/gh-pages..HEAD を検査する
npm run build && python3 tools/publish_lint.py --dir dist   # ビルドの成果物を検査する
python3 -m unittest discover -s tools -p "test_*.py"   # 検査そのものの検査
```

終了コードは 0 ＝ 通す、1 ＝ 止めるものがあった、2 ＝ 検査できなかった（通さない）。

- **止まったら、push する前のコミットを作り直す。**直したコミットを足すだけでは、元のコミットが履歴に残る
- **画像を足すとき**は、自分の目で中身を見てから（画面写真には名前やパスが写り込む）、
  検査が表示する「`<SHA> <パス>`」の行を [`publish-allow.txt`](publish-allow.txt) に足して、同じコミットに入れる
- **`--no-verify` で飛ばさない。**検査が間違って止めたなら、検査のほうを直す
- Windows の Git Bash では `python3` が動かないことがある（その場合はフックが失敗して push が止まる）。WSL から push する

## GitHub Actions での検査

公開する直前に、`.github/workflows/deploy.yml` がビルドの成果物（`dist/`）に `--dir` で検査をかける。
コミットの検査（push の前）だけでは、ビルドで混ざるもの（npm の中身・束ねたコード）を見られないため。
止まったら公開しない。

Actions には手元の一覧が無いので、**リポジトリの Secret `PUBLISH_DENY_WORDS`** に同じ言葉を置く（1行に1語）。
置いていないと検査できず、公開しない。手元の一覧を直したら、Secret も置き直す。

置き場所は Web の画面: Settings → Secrets and variables → Actions → New repository secret。
`gh secret set` は使わない（手元の `gh` の fine-grained PAT には Secrets の権限を付けていない。
権限を絞った方針なので、このために足さない）。

## なぜこの形か

- **コミットを1つずつ見る**: 足して次のコミットで消しても履歴には残るので、最終の差分だけでは見逃す
- **一覧が無ければ止める**: 「守るものが無いので通す」は、検査が黙って素通りする典型的な壊れ方
- **テストは止まる側と通る側の両方を見る**: 「止まれば効いている」だけを確かめると、常に止まる壊れ方を見逃す
