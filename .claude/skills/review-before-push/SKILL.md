---
name: review-before-push
description: push する前に、機械の検査（tools/publish_lint.py）では見つけられない観点で差分を読む。画像への写り込み、貼り付けた出力に混じる環境の情報、公開していないものの名前、図解と本文の食い違いなど。このリポジトリは gh-pages への push がそのまま公開になる（Actions がビルドして公開する）ので、push の前に毎回使う。
---

# push する前のレビュー

観点は [`docs/review-checklist.md`](../../../docs/review-checklist.md) にある。
**本文をここに写さない。**同じものを2か所で持つと、片方が腐って気づけなくなる。

## 手順

1. `python3 tools/publish_lint.py` と、`npm run build` のあとの `python3 tools/publish_lint.py --dir dist` を走らせる。
   止まったら、レビューより先にそれを直す
2. `docs/review-checklist.md` を読む
3. 対象の差分を出す（既定は `git log -p origin/gh-pages..HEAD`。コミットメッセージも読む）
4. 足した・変えたファイルは、差分だけでなく**ファイルごと開く**。画像は表示して隅まで見る
5. 図解が含まれていたら、`docs/explainer-guide.md` の「仕上げる前の確認」も当てる
6. 指摘を2つに分けて出す
   - A: 公開すると取り消せないもの。**push しない**。直してからコミットを作り直す（足して消すだけでは履歴に残る）
   - B: 直せば済むもの。直すが push は止めない
7. push は本人が決める。こちらからはしない

## 機械が見る側と重ねない

`tools/publish_lint.py` が、鍵・トークン、ユーザ名入りのパス・メール・IP、一覧にある公開しない言葉、
鍵や `.env` のファイル、未確認のバイナリ、`Claude-Session:` の行を見る。`--dir` では、ビルドの成果物の
中身と、外部から読み込むスクリプト（S7）も見る。そちらで止まるものをここで探さない。
ここで探すのは、**その形をしていないのに取り消せないもの**（画像の中身、貼り付けた出力、一覧に無い名前）。
