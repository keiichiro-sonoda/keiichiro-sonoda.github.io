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
| S7 | 外部のドメインから読み込むスクリプト・スタイル（許可した一覧の外） | `--dir`（ビルドの成果物の HTML）だけ |

- **コミットを1つずつ見る。**足して次のコミットで消しても、履歴には残る。最終の差分だけを
  見ると、その形を見逃す
- **S3 の一覧はリポジトリに入れない。**公開しない言葉の一覧を公開リポジトリに置けば、
  一覧そのものが漏れる。一覧が見つからなければ、通さずに「検査できない」で止める
- **S5 は止めるが、見たうえで通せる。**画像は中身を機械で読めない（画面写真に名前や
  パスが写り込むことがある）。自分の目で見てから `publish-allow.txt` に登録したものだけ通す
- **検査できなかったら通さない。**比較先が無い・git が答えない・一覧が無いときは終了コード 2
- **`--dir` はビルドの成果物を見る。**サイトは Astro でビルドしてから公開するので、公開されるのは
  コミットの中身そのものではない（部品が束ねられ、npm の中身も混ざる）。GitHub Actions が、公開する
  直前の成果物に S1〜S4 と S7 をかける。S5 は見ない（バイナリはコミットの時点で見ている）
- **S7 だけは「取り消せないもの」ではない。**ただ、外部の `<script src>` は、そのドメインの今の持ち主に
  このサイトの上で任意のコードを実行させるのと同じで、持ち主が変わっても気づけないまま配り続ける
  （polyfill.io は 2024 年に売られ、読み込んでいたサイトに悪意のあるコードを配った）。
  ライブラリは npm で版を固定して入れ、`public/vendor/` から配る（`tools/vendor.mjs`）

使い方:

    python3 tools/publish_lint.py                    # origin/gh-pages..HEAD を見る
    python3 tools/publish_lint.py --base <ref>       # 比較先を変える
    python3 tools/publish_lint.py --hook             # pre-push フックから（標準入力で ref を受け取る）
    python3 tools/publish_lint.py --dir dist         # ビルドの成果物を見る（GitHub Actions から）

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
GENERATED = ("package-lock.json",)
# 成果物の中で、npm から写したもの・束ねたもの。個人や機械の情報は入りようがなく、版番号などが S2 に当たるので S2 を見ない
# （S1 も、トークンや鍵の決まった形だけを見る）
THIRD_PARTY = ("vendor/", "_astro/")

# --------------------------------------------------------------------------
# S4 公開してはいけない名前
# --------------------------------------------------------------------------
BAD_NAMES = (
    ("鍵らしきファイル", re.compile(r"(?:^|/)(?:id_rsa|id_ed25519|id_ecdsa)[^/]*$|\.(?:pem|key|p12|pfx)$")),
    ("環境変数のファイル", re.compile(r"(?:^|/)\.env(?:\.[^/]*)?$")),
    ("ビルドの出力・npm の中身", re.compile(r"^(?:dist|\.astro|node_modules|public/vendor)/")),
)

# --------------------------------------------------------------------------
# S6 会話ログへのポインタ
# --------------------------------------------------------------------------
SESSION_LINE = re.compile(r"^\s*Claude-Session:\s*(?:\S+://|[0-9A-Fa-f][0-9A-Fa-f-]{15,})", re.MULTILINE)

# --------------------------------------------------------------------------
# S7 外部から読み込むスクリプト・スタイル
# 足すときは、そのドメインを誰が持っているか・持ち主が変わったら何が起きるかを考えてから
# --------------------------------------------------------------------------
ALLOWED_HOSTS = (
    "fonts.googleapis.com",  # Google Fonts の CSS（スクリプトではない）
)
LOAD_TAG = re.compile(r"<(script|link)\b[^>]*>", re.IGNORECASE)
ATTR = re.compile(r"""\b(src|href|rel)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", re.IGNORECASE)
EXTERNAL_URL = re.compile(r"^(?:https?:)?//([^/?#:]+)", re.IGNORECASE)


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


def external_loads(html: str) -> list[tuple[str, str]]:
    """外部から読み込む <script src> と <link rel="stylesheet|preload|modulepreload"> の (タグ, ドメイン)"""
    out = []
    for m in LOAD_TAG.finditer(html):
        tag = m.group(1).lower()
        attrs = {}
        for a in ATTR.finditer(m.group(0)):
            attrs[a.group(1).lower()] = next(g for g in a.groups()[1:] if g is not None)
        if tag == "script":
            url = attrs.get("src")
        elif set(attrs.get("rel", "").lower().split()) & {"stylesheet", "preload", "modulepreload"}:
            url = attrs.get("href")
        else:
            continue  # preconnect やアイコンはコードを読み込まない
        if url and (host := EXTERNAL_URL.match(url.strip())):
            out.append((tag, host.group(1).lower()))
    return out


def check_dir(top: pathlib.Path, words: list[str]) -> tuple[int, list[tuple[str, str, str]]]:
    """ビルドの成果物を見る。S1〜S3 は中身の行ごと、S4 はパス、S7 は HTML"""
    if not top.is_dir():
        raise CannotCheck(f"検査するディレクトリが無い: {top}（先にビルドすること）")
    files = sorted(p for p in top.rglob("*") if p.is_file())
    if not files:
        raise CannotCheck(f"検査するディレクトリが空: {top}")
    found = []
    for f in files:
        rel = f.relative_to(top).as_posix()
        for name, rx in BAD_NAMES:
            if rx.search(rel):
                found.append(("S4", rel, name))
        data = f.read_bytes()
        if b"\0" in data[:8192]:
            continue  # バイナリ（画像・フォント）。コミットの時点で S5 が見ている
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        third_party = rel.startswith(THIRD_PARTY)
        for i, line in enumerate(text.splitlines(), 1):
            for rule, where, what in check_text(f"{rel}:{i}", line, words, in_message=False):
                # 圧縮したコードは password=... のような形をいくらでも含むので、大まかな「秘密らしき代入」も見ない
                if third_party and (rule == "S2" or what.startswith("秘密らしき代入")):
                    continue
                found.append((rule, where, what))
        if rel.endswith(".html"):
            for tag, host in external_loads(text):
                if host not in ALLOWED_HOSTS:
                    found.append(("S7", rel, f"外部から読み込む <{tag}>: {host}（npm で入れて public/vendor/ から配る）"))
    return len(files), found


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
    ap.add_argument("--dir", type=pathlib.Path, help="コミットではなく、このディレクトリ（ビルドの成果物）を見る")
    a = ap.parse_args(argv)
    try:
        words = deny_words()
        if a.dir is not None:
            print(f"検査: {a.dir}（ビルドの成果物）")
            n, found = check_dir(a.dir, words)
            label = f"ファイル {n} 個"
        elif a.hook:
            ranges = commits_for_hook(sys.stdin.read())
        else:
            ranges = [(f"{a.base}..{a.head}", commits_for_range(a.base, a.head))]
        if a.dir is None:
            total, found = 0, []
            for rng, shas in ranges:
                print(f"検査: {rng}（コミット {len(shas)} 個）")
                total += len(shas)
                for sha in shas:
                    found += check_commit(sha, words)
            label = f"コミット {total} 個"
    except CannotCheck as e:
        print(f"検査できない（通さない）: {e}", file=sys.stderr)
        return 2
    if found:
        print(f"\n止める: {len(found)} 件", file=sys.stderr)
        for rule, where, what in found:
            print(f"  [{rule}] {where}  {what}", file=sys.stderr)
        if a.dir is None:
            print("\n直してからコミットし直すこと（足して消すだけでは履歴に残る。まだ push していないなら、コミットを作り直す）", file=sys.stderr)
        else:
            print("\n公開しない。元になったコミットを直すこと", file=sys.stderr)
        return 1
    print(f"通す: {label}に、止めるものは無かった（公開しない言葉 {len(words)} 語で照合）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
