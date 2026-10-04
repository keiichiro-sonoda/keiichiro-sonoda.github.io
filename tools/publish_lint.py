#!/usr/bin/env python3
"""公開する前に、取り消せないものだけを止める。

このリポジトリは GitHub Pages で、`gh-pages` に push した瞬間に世界へ公開される。
公開リポジトリに一度出したものは引っ込められない。履歴から消しても SHA を知って
いれば取れることがあり、fork・キャッシュ・アーカイブにも渡る。鍵は失効させるしかなく、
個人や手元の機械を特定する情報には、取り消す手段そのものが無い。

だから、この検査が見るのは**あとから直しても取り戻せない種類だけ**にする。
誤字・説明の誤り・デザインは見ない（直して push し直せば済む。見張る対象に混ぜると、
鳴っても push を止めない癖がつく）。

| ID | 内容 | 見る範囲 |
|----|------|----------|
| S1 | 鍵・トークンらしき文字列 | 各コミットの追加行とメッセージ |
| S2 | 個人や機械を特定する情報（ユーザ名入りの絶対パス・メール・IP） | 各コミットの追加行とメッセージ |
| S3 | 公開しない言葉（手元にだけある一覧。機械の呼び名など） | 各コミットの追加行とメッセージ |
| S4 | 公開してはいけない名前のファイル（鍵・`.env`・ビルドの出力） | 各コミットで足したファイル |
| S5 | 中身を検査できないファイル（画像などのバイナリ） | 各コミットで足した・変えたファイル |
| S6 | コミットメッセージの会話ログへのポインタ | 各コミットのメッセージ |

- **コミットを1つずつ見る。**足して次のコミットで消しても、履歴には残る。最終の差分だけを
  見ると、その形を見逃す
- **S3 の一覧はリポジトリに入れない。**公開しない言葉の一覧を公開リポジトリに置けば、
  一覧そのものが漏れる。一覧が見つからなければ、通さずに「検査できない」で止める
- **S5 は止めるが、見たうえで通せる。**画像は中身を機械で読めない（画面写真に名前や
  パスが写り込むことがある）。自分の目で見てから `publish-allow.txt` に登録したものだけ通す
- **検査できなかったら通さない。**比較先が無い・git が答えない・一覧が無いときは終了コード 2

使い方:

    python3 tools/publish_lint.py                    # origin/gh-pages..HEAD を見る
    python3 tools/publish_lint.py --base <ref>       # 比較先を変える
    python3 tools/publish_lint.py --hook             # pre-push フックから（標準入力で ref を受け取る）

終了コード: 0 = 通す / 1 = 止めるものがあった / 2 = 検査できなかった（通さない）
"""

from __future__ import annotations

import argparse
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZERO = "0" * 40
ALLOW_FILE = "publish-allow.txt"

# --------------------------------------------------------------------------
# S1 鍵・トークン
# ⚠️ 検体を literal で書かない。どの形も長さか後続の文字を要求するので、この表そのものは
#    検体にならない（テストも検体を実行時に組み立てる）
# --------------------------------------------------------------------------
SECRETS = (
    ("PEM 秘密鍵らしき文字列", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("GitHub トークンらしき文字列", re.compile(r"\bgh[pousr]_[0-9A-Za-z]{36}\b")),
    ("GitHub PAT らしき文字列", re.compile(r"\bgithub_pat_[0-9A-Za-z_]{22,}")),
    ("AWS アクセスキーらしき文字列", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("`sk-` で始まる API キーらしき文字列", re.compile(r"\bsk-[0-9A-Za-z_-]{20,}")),
    ("Slack トークンらしき文字列", re.compile(r"\bxox[abprs]-[0-9A-Za-z-]{10,}")),
    ("Google API キーらしき文字列", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("Authorization ヘッダらしき文字列", re.compile(r"[Aa]uthorization:\s*(?:Bearer|Basic)\s+\S")),
    ("認証情報つきの URL", re.compile(r"\b[a-z][a-z0-9+.-]*://[^/\s:@]+:[^/\s@]+@")),
    # 値に英字と数字の両方を要求する（`token = {TOKEN}` のような言及で鳴らないため）
    (
        "秘密らしき代入",
        re.compile(
            r"(?i)\b(?:password|passwd|secret|token|api[-_]?key)\s*[=:]\s*[\"']?"
            r"(?=[^\s\"']*[A-Za-z])(?=[^\s\"']*\d)[^\s\"'{}]{8,}"
        ),
    ),
)

# --------------------------------------------------------------------------
# S2 個人や機械を特定する情報
# --------------------------------------------------------------------------
USER_PATH = (
    "ユーザ名を含む絶対パス",
    re.compile(r"/(?:home|Users)/[A-Za-z0-9._-]+|[A-Za-z]:\\+Users\\+[A-Za-z0-9._-]+|/mnt/[a-z]/Users/[A-Za-z0-9._-]+"),
)
EMAIL = ("メールアドレス", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"))
IPV4 = ("IP アドレスらしき文字列", re.compile(r"(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])"))
# メッセージでは、署名の行（`Co-Authored-By:` など）のメールだけ通す
TRAILER = re.compile(r"^[A-Za-z][A-Za-z-]*-[Bb]y:\s")
# 生成物なので中身を選べない（版番号が IP の形に当たる）
GENERATED = ("Gemfile.lock",)

# --------------------------------------------------------------------------
# S4 公開してはいけない名前
# --------------------------------------------------------------------------
BAD_NAMES = (
    ("鍵らしきファイル", re.compile(r"(?:^|/)(?:id_rsa|id_ed25519|id_ecdsa)[^/]*$|\.(?:pem|key|p12|pfx)$")),
    ("環境変数のファイル", re.compile(r"(?:^|/)\.env(?:\.[^/]*)?$")),
    ("Jekyll のビルドの出力", re.compile(r"^(?:_site|\.jekyll-cache|\.sass-cache)/")),
)

# --------------------------------------------------------------------------
# S6 会話ログへのポインタ
# --------------------------------------------------------------------------
SESSION_LINE = re.compile(r"^\s*Claude-Session:\s*(?:\S+://|[0-9A-Fa-f][0-9A-Fa-f-]{15,})", re.MULTILINE)


class CannotCheck(Exception):
    """検査できない。通さずに終了コード 2 にする"""


def git(*args: str, input_text: str | None = None) -> str:
    p = subprocess.run(
        ["git", *args], cwd=ROOT, input=input_text, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    if p.returncode != 0:
        raise CannotCheck(f"git {' '.join(args)} が失敗した: {p.stderr.strip()}")
    return p.stdout


def deny_words() -> list[str]:
    """S3 の一覧。リポジトリの外から読む。無ければ検査できない"""
    path = pathlib.Path(os.environ.get("PUBLISH_DENY") or pathlib.Path.home() / ".config/publish-lint/deny.txt")
    if not path.is_file():
        raise CannotCheck(
            f"公開しない言葉の一覧が無い: {path}\n"
            "  1行に1語で書いて置くこと（リポジトリには入れない）。置き場所は環境変数 PUBLISH_DENY でも変えられる"
        )
    words = [w.strip() for w in path.read_text(encoding="utf-8").splitlines()]
    words = [w for w in words if w and not w.startswith("#")]
    if not words:
        raise CannotCheck(f"公開しない言葉の一覧が空: {path}")
    return words


def mask(s: str) -> str:
    s = s.strip()
    return s if len(s) <= 6 else s[:3] + "…" + s[-2:]


def added_lines(sha: str, is_merge: bool) -> list[tuple[str, int, str]]:
    """そのコミットで足された行 (パス, 行番号, 中身)。マージはそのマージ独自の追加だけ"""
    args = ["show", "--format=", "--unified=0", "--no-color", "--no-ext-diff", "--no-renames"]
    args += ["--cc"] if is_merge else []
    out, path, line = [], None, 0
    for row in git(*args, sha).splitlines():
        if row.startswith("+++ "):
            path = None if row[4:] == "/dev/null" else row[4:].removeprefix("b/")
        elif row.startswith("@@"):
            m = re.search(r"\+(\d+)", row.split("@@")[-2] if row.count("@@") >= 2 else row)
            line = int(m.group(1)) if m else 0
        elif path and row.startswith("+") and not row.startswith("+++"):
            out.append((path, line, row[1:]))
            line += 1
        elif path and row.startswith(" "):
            line += 1
    return out


def changed_files(sha: str) -> list[tuple[str, str, bool]]:
    """(状態, パス, バイナリか)。状態は A/M/D など"""
    status = {}
    for row in git("show", "--format=", "--name-status", "--no-renames", "-m", "--first-parent", sha).splitlines():
        parts = row.split("\t")
        if len(parts) >= 2:
            status[parts[-1]] = parts[0][0]
    binary = set()
    for row in git("show", "--format=", "--numstat", "--no-renames", "-m", "--first-parent", sha).splitlines():
        parts = row.split("\t")
        if len(parts) == 3 and parts[0] == "-" and parts[1] == "-":
            binary.add(parts[2])
    return [(st, p, p in binary) for p, st in status.items()]


def allowed_binaries(sha: str) -> dict[str, str]:
    """そのコミット時点の publish-allow.txt。行は「<blob の SHA> <パス>」"""
    try:
        text = git("show", f"{sha}:{ALLOW_FILE}")
    except CannotCheck:
        return {}
    out = {}
    for row in text.splitlines():
        row = row.strip()
        if row and not row.startswith("#"):
            blob, _, p = row.partition(" ")
            out[p.strip()] = blob
    return out


def check_text(where: str, text: str, words: list[str], in_message: bool) -> list[tuple[str, str, str]]:
    found = []
    for name, rx in SECRETS:
        if m := rx.search(text):
            found.append(("S1", where, f"{name}: {mask(m.group(0))}"))
    path = where.split(":")[0]
    if not (path in GENERATED and not in_message):
        for name, rx in (USER_PATH, EMAIL, IPV4):
            if name == EMAIL[0] and in_message and TRAILER.match(text):
                continue
            for m in rx.finditer(text):
                # 自分自身を指すアドレス（ローカルで確かめる手順など）は誰も特定しない
                if name == IPV4[0] and (m.group(0).startswith("127.") or m.group(0) == "0.0.0.0"):
                    continue
                found.append(("S2", where, f"{name}: {mask(m.group(0))}"))
                break
    low = text.lower()
    for w in words:
        if w.lower() in low:
            found.append(("S3", where, f"公開しない言葉: {mask(w)}"))
    return found


def check_commit(sha: str, words: list[str]) -> list[tuple[str, str, str]]:
    short = sha[:7]
    parents = git("rev-list", "--parents", "-n", "1", sha).split()[1:]
    found = []
    message = git("log", "-1", "--format=%B", sha)
    for i, row in enumerate(message.splitlines(), 1):
        found += check_text(f"{short} メッセージ {i}行目", row, words, in_message=True)
    if SESSION_LINE.search(message):
        found.append(("S6", f"{short} メッセージ", "Claude-Session: の行（会話ログへのポインタ）"))
    for path, line, text in added_lines(sha, len(parents) > 1):
        found += [(r, f"{short} {path}:{line}", w) for r, _, w in check_text(f"{path}:{line}", text, words, False)]
    allow = None
    for st, path, is_bin in changed_files(sha):
        if st == "D":
            continue
        for name, rx in BAD_NAMES:
            if rx.search(path):
                found.append(("S4", f"{short} {path}", name))
        if is_bin:
            allow = allow if allow is not None else allowed_binaries(sha)
            blob = git("rev-parse", f"{sha}:{path}").strip()
            if allow.get(path) != blob:
                found.append((
                    "S5", f"{short} {path}",
                    f"中身を検査できないファイル。目で見てから {ALLOW_FILE} に「{blob} {path}」を足す",
                ))
    return found


def commits_for_range(base: str, head: str) -> list[str]:
    git("rev-parse", "--verify", f"{base}^{{commit}}")
    return git("rev-list", "--reverse", f"{base}..{head}").split()


def commits_for_hook(stdin: str) -> list[tuple[str, list[str]]]:
    out = []
    for row in stdin.splitlines():
        parts = row.split()
        if len(parts) != 4:
            continue
        local_ref, local, remote_ref, remote = parts
        if local == ZERO:
            continue  # 削除。中身は出ない
        if remote == ZERO:
            shas = git("rev-list", "--reverse", local, "--not", "--remotes").split()
        else:
            try:
                git("cat-file", "-e", f"{remote}^{{commit}}")
            except CannotCheck:
                raise CannotCheck(f"push 先の {remote_ref} の先頭 {remote[:7]} が手元に無い。git fetch してからやり直すこと")
            shas = git("rev-list", "--reverse", f"{remote}..{local}").split()
        out.append((f"{local_ref} → {remote_ref}", shas))
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="公開する前に、取り消せないものだけを止める")
    ap.add_argument("--base", default="origin/gh-pages")
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--hook", action="store_true", help="pre-push フックとして標準入力から ref を読む")
    a = ap.parse_args(argv)
    try:
        words = deny_words()
        if a.hook:
            ranges = commits_for_hook(sys.stdin.read())
        else:
            ranges = [(f"{a.base}..{a.head}", commits_for_range(a.base, a.head))]
        total, found = 0, []
        for label, shas in ranges:
            print(f"検査: {label}（コミット {len(shas)} 個）")
            total += len(shas)
            for sha in shas:
                found += check_commit(sha, words)
    except CannotCheck as e:
        print(f"検査できない（通さない）: {e}", file=sys.stderr)
        return 2
    if found:
        print(f"\n止める: {len(found)} 件", file=sys.stderr)
        for rule, where, what in found:
            print(f"  [{rule}] {where}  {what}", file=sys.stderr)
        print("\n直してからコミットし直すこと（足して消すだけでは履歴に残る。まだ push していないなら、コミットを作り直す）", file=sys.stderr)
        return 1
    print(f"通す: コミット {total} 個に、止めるものは無かった（公開しない言葉 {len(words)} 語で照合）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
