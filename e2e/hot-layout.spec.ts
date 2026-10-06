import { expect, test } from "@playwright/test";

// 関数の置き場所の図解。1ページ（記事）の中に、前提・動く帯・8段階の説明がそろっていること
const URL = "/2026/10/04/hot-layout.html";

test("前提のカードと動く帯が、記事の中に入っている", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("h1")).toHaveText("同じ命令なのに、なぜ遅くなる？");
  await expect(page.locator(".prereq .card")).toHaveCount(4);
  await expect(page.locator(".hl svg .fn")).toHaveCount(4);
  await expect(page.getByRole("link", { name: /図解を開く/ })).toHaveCount(0); // 2段階の名残が無い
});

test("8段階を順に進められ、段階5では片方のループだけが境目をまたぐ", async ({ page }) => {
  await page.goto(URL);
  const steps = page.getByRole("navigation", { name: "段階" }).getByRole("button");
  await expect(steps).toHaveCount(8);
  await steps.nth(4).click();
  const readouts = page.locator(".ro");
  await expect(readouts.nth(0)).toContainText("2 個");
  await expect(readouts.nth(1)).toContainText("1 個");
  await steps.nth(5).click(); // 直した配置: 両方1個
  await expect(readouts.nth(0)).toContainText("1 個");
  await expect(readouts.nth(1)).toContainText("1 個");
  const next = page.getByRole("button", { name: "次へ →" });
  await next.click();
  await next.click();
  await expect(next).toBeDisabled();
});

test("記事の本文の書式に、図解の見出しが負けない（段階の見出しが上に大きくあかない）", async ({ page }) => {
  await page.goto(URL);
  const marginTop = await page.locator(".scene h2").evaluate((h) => getComputedStyle(h).marginTop);
  expect(marginTop).toBe("0px");
});

test("どの段階でも、ページが横にはみ出さない（段階7の表で、スマホの画面が縮小表示になっていた）", async ({ page }) => {
  await page.goto(URL);
  const steps = page.getByRole("navigation", { name: "段階" }).getByRole("button");
  for (let i = 0; i < 8; i++) {
    await steps.nth(i).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `段階 ${i + 1}`).toBeLessThanOrEqual(0);
  }
});
