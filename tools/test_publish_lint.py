"""publish_lint.py の検査。止まるべきときに止まり、通るべきときに通ることを両方見る。

    python3 -m unittest discover -s tools -p "test_*.py"

使い捨ての git リポジトリを作り、そこへ publish_lint.py を写して走らせる。
⚠️ 検体（トークン・パス・公開しない言葉）は literal で書かない。実行時に組み立てる
（このファイル自身がコミットされたとき、検査に引っかからないため）。
"""

from __future__ import annotations

import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOL = pathlib.Path(__file__).resolve().parent / "publish_lint.py"
WORD = "ひみつ" + "の呼び名"          # 公開しない言葉の検体
TOKEN = "gh" + "p_" + "A1b2" * 9      # GitHub トークンの形の検体（36文字）
HOMEPATH = "/ho" + "me/" + "someone/work"
AT = "@"                              # メールの検体も組み立てる（このファイル自身が S2 に当たらないため）
PNG = bytes.fromhex("89504e470d0a1a0a") + b"\x00\x01\x02binary"


class Repo:
    def __init__(self, tmp: pathlib.Path):
        self.dir = tmp / "repo"
        self.dir.mkdir()
        (self.dir / "tools").mkdir()
        shutil.copy(TOOL, self.dir / "tools" / "publish_lint.py")
        self.deny = tmp / "deny.txt"
        self.deny.write_text("# コメント\n" + WORD + "\n", encoding="utf-8")
        self.git("init", "-q", "-b", "gh-pages")
        self.git("config", "user.name", "tester")
        self.git("config", "user.email", "tester" + AT + "example.invalid")
        self.write("index.md", "はじめ\n")
        self.commit("最初")
        self.git("branch", "base")

    def git(self, *args: str, input_text: str | None = None) -> str:
        return subprocess.run(["git", *args], cwd=self.dir, check=True, capture_output=True,
                              text=True, input=input_text).stdout

    def write(self, name: str, content: str | bytes) -> None:
        p = self.dir / name
        p.parent.mkdir(parents=True, exist_ok=True)
        (p.write_bytes if isinstance(content, bytes) else lambda c: p.write_text(c, encoding="utf-8"))(content)

    def commit(self, message: str) -> str:
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", message)
        return self.git("rev-parse", "HEAD").strip()

    def lint(self, *args: str, deny: bool = True, stdin: str | None = None) -> subprocess.CompletedProcess:
        env = dict(os.environ)
        env["PUBLISH_DENY"] = str(self.deny if deny else self.dir / "no-such-file")
        return subprocess.run([sys.executable, "tools/publish_lint.py", *args], cwd=self.dir, env=env,
                              capture_output=True, text=True, input=stdin)


class PublishLintTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.r = Repo(pathlib.Path(self._tmp.name))

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def assertCode(self, p: subprocess.CompletedProcess, code: int) -> None:
        self.assertEqual(p.returncode, code, p.stdout + p.stderr)

    # ---- 通る側 -------------------------------------------------------------
    def test_clean_commit_passes(self) -> None:
        self.r.write("explainers/a/index.html", "<p>図解</p>\n")
        self.r.commit("図解を足す\n\nCo-Authored-By: Someone <someone" + AT + "example.com>")
        p = self.r.lint("--base", "base")
        self.assertCode(p, 0)
        self.assertIn("コミット 1 個", p.stdout)

    def test_nothing_to_check_passes_and_says_so(self) -> None:
        p = self.r.lint("--base", "base")
        self.assertCode(p, 0)
        self.assertIn("コミット 0 個", p.stdout)

    # ---- 止める側 -----------------------------------------------------------
    def test_token_in_file_stops(self) -> None:
        self.r.write("a.js", f"const k = '{TOKEN}';\n")
        self.r.commit("足す")
        p = self.r.lint("--base", "base")
        self.assertCode(p, 1)
        self.assertIn("[S1]", p.stderr)
        self.assertNotIn(TOKEN, p.stderr + p.stdout)  # 検体をそのまま表示しない

    def test_removed_in_next_commit_still_stops(self) -> None:
        self.r.write("a.js", f"const k = '{TOKEN}';\n")
        self.r.commit("足す")
        self.r.write("a.js", "const k = '';\n")
        self.r.commit("消す")
        self.assertCode(self.r.lint("--base", "base"), 1)

    def test_user_path_stops(self) -> None:
        self.r.write("post.md", f"実行場所: {HOMEPATH}\n")
        self.r.commit("足す")
        p = self.r.lint("--base", "base")
        self.assertCode(p, 1)
        self.assertIn("[S2]", p.stderr)

    def test_email_in_file_stops_but_trailer_in_message_passes(self) -> None:
        self.r.write("about.md", "連絡先 someone" + AT + "example.com\n")
        self.r.commit("足す\n\nCo-Authored-By: X <x" + AT + "example.com>")
        p = self.r.lint("--base", "base")
        self.assertCode(p, 1)
        self.assertIn("about.md", p.stderr)
        self.assertNotIn("メッセージ", p.stderr)

    def test_deny_word_in_file_and_message_stops(self) -> None:
        self.r.write("post.md", f"{WORD}で動かした\n")
        self.r.commit(f"{WORD}で確かめた")
        p = self.r.lint("--base", "base")
        self.assertCode(p, 1)
        self.assertIn("post.md", p.stderr)
        self.assertIn("メッセージ", p.stderr)

    def test_session_pointer_stops(self) -> None:
        self.r.commit("足す\n\nClaude-Session: " + "https" + "://example.invalid/s/123")
        p = self.r.lint("--base", "base")
        self.assertCode(p, 1)
        self.assertIn("[S6]", p.stderr)

    def test_bad_file_name_stops(self) -> None:
        self.r.write(".env", "A=1\n")
        self.r.commit("足す")
        p = self.r.lint("--base", "base")
        self.assertCode(p, 1)
        self.assertIn("[S4]", p.stderr)

    def test_binary_stops_until_allowed_with_its_hash(self) -> None:
        self.r.write("img/a.png", PNG)
        self.r.commit("画像")
        self.assertCode(self.r.lint("--base", "base"), 1)
        blob = self.r.git("rev-parse", "HEAD:img/a.png").strip()
        # 見たうえで登録すれば通る（登録は画像と同じコミットで）
        self.r.git("reset", "-q", "--soft", "base")
        self.r.write("publish-allow.txt", f"{blob} img/a.png\n")
        self.r.commit("画像（見て登録した）")
        self.assertCode(self.r.lint("--base", "base"), 0)
        # 中身が変われば、登録は効かない
        self.r.write("img/a.png", PNG + b"changed")
        self.r.commit("画像を差し替え")
        self.assertCode(self.r.lint("--base", "base"), 1)

    # ---- 検査できない（通さない） ------------------------------------------
    def test_missing_deny_list_cannot_check(self) -> None:
        p = self.r.lint("--base", "base", deny=False)
        self.assertCode(p, 2)
        self.assertIn("一覧が無い", p.stderr)

    def test_unknown_base_cannot_check(self) -> None:
        self.assertCode(self.r.lint("--base", "no-such-ref"), 2)

    # ---- pre-push フックとしての入口 ----------------------------------------
    def test_hook_reads_refs_from_stdin(self) -> None:
        base = self.r.git("rev-parse", "base").strip()
        self.r.write("post.md", f"{WORD}\n")
        head = self.r.commit("足す")
        line = f"refs/heads/gh-pages {head} refs/heads/gh-pages {base}\n"
        self.assertCode(self.r.lint("--hook", stdin=line), 1)
        # 削除の push は中身を出さないので通す
        line = f"(delete) {'0' * 40} refs/heads/old {base}\n"
        self.assertCode(self.r.lint("--hook", stdin=line), 0)

    def test_hook_with_unknown_remote_head_cannot_check(self) -> None:
        head = self.r.git("rev-parse", "HEAD").strip()
        line = f"refs/heads/gh-pages {head} refs/heads/gh-pages {'1' * 40}\n"
        self.assertCode(self.r.lint("--hook", stdin=line), 2)


if __name__ == "__main__":
    unittest.main()
