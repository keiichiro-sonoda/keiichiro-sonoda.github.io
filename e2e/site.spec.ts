import { expect, test } from "@playwright/test";

// サイト全体の煙テスト。Jekyll 時代と同じ URL で開け、エラーが出ないこと
const PAGES = [
  "/",
  "/about/",
  "/2026/10/04/hot-layout.html",
  "/2023/07/11/tsp-ga.html",
  "/2023/07/13/multi-stock-encoder.html",
  "/2023/07/28/unbiased-variance.html",
  "/2023/09/09/cubic-combination-searcher.html",
  "/2024/03/03/dense_sample.html",
  "/2024/03/14/rnn_sample.html",
];

for (const path of PAGES) {
  test(`${path} が開け、エラーが出ない`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
}

test("トップの一覧から記事に行ける", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /巡回セールスマン問題/ }).click();
  await expect(page).toHaveURL(/\/2023\/07\/11\/tsp-ga\.html$/);
});

test("無い URL は 404 のページになる", async ({ page }) => {
  const res = await page.goto("/no-such-page.html");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("ページが見つかりませんでした")).toBeVisible();
});

test("図解の古い URL（/explainers/hot-layout/）は、記事へ転送する", async ({ page }) => {
  await page.goto("/explainers/hot-layout/");
  await expect(page).toHaveURL(/\/2026\/10\/04\/hot-layout\.html$/);
  await expect(page.locator("h1")).toHaveText("同じ命令なのに、なぜ遅くなる？");
});

// フォントの一貫性。図解を記事にまとめたとき、段階の見出しだけ独立ページ時代の表示用フォントのまま残った
// （本人の指摘）。iframe の中の古い作品は、サイトから隔てるためにわざと別なので見ない
const FONTS = ["Zen Kaku Gothic New", "JetBrains Mono"]; // 本文・見出し / 数字
for (const path of PAGES) {
  test(`${path} の見出し・本文のフォントが、サイト共通のものだけで、記事の見出しの大きさがそろう`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await page.evaluate(() => {
      const fams = new Set<string>();
      for (const el of document.querySelectorAll("h1, h2, h3, legend, p, li, label, button")) {
        if (!(el as HTMLElement).offsetParent) continue;
        fams.add(getComputedStyle(el).fontFamily.split(",")[0].replace(/["\x27]/g, "").trim());
      }
      const h2 = [...document.querySelectorAll("main h2")]
        .filter((h) => (h as HTMLElement).offsetParent)
        .map((h) => `${getComputedStyle(h).fontSize} ${getComputedStyle(h).fontWeight}`);
      return { fams: [...fams], h2: [...new Set(h2)] };
    });
    for (const f of r.fams) expect(FONTS, `${path} のフォント`).toContain(f);
    expect(r.h2.length, `${path} の h2: ${r.h2.join(" / ")}`).toBeLessThanOrEqual(1);
  });
}
