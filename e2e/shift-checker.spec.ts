import { expect, test } from "@playwright/test";

const URL = "/2026/10/30/shift-checker.html";
const days = (n: number) => Array.from({ length: n }, (_, d) => String(d + 1));

test.describe("勤務表のチェッカー", () => {
  test("架空の表を入れると、わざと崩したところが違反・注意として出る", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "架空の表を入れてみる" }).click();
    const counts = page.getByTestId("counts");
    await expect(counts.locator('[data-severity="違反"] b')).toHaveText("5");
    await expect(counts.locator('[data-severity="注意"] b')).toHaveText("2");
    await expect(page.getByTestId("issues")).toContainText("N2 の");
    await expect(page.getByTestId("issues")).toContainText("応援なら足りる");
    await expect(page.locator(".sc-grid .sc-unit", { hasText: "フロア→B" })).toBeVisible();
  });

  test("その日だけの数え先を書くと、応援の注意が消える", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "架空の表を入れてみる" }).click();
    const counts = page.getByTestId("counts");
    await page.getByLabel("ユニット外の人の数え先").fill("S1: B\nS1: 23 A");
    await expect(counts.locator('[data-severity="違反"] b')).toHaveText("5");
    await expect(counts.locator('[data-severity="注意"] b')).toHaveText("1");
    await expect(page.getByTestId("issues")).not.toContainText("応援なら足りる");
  });

  test("一覧の行を押すと表のマスが光り、マスを押すと一覧の行が光る", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "架空の表を入れてみる" }).click();
    await page.getByTestId("issues").getByRole("button", { name: /夜勤の翌日/ }).click();
    const cell = page.locator(".sc-grid td[data-selected]");
    await expect(cell).toHaveCount(1);
    await expect(cell).toHaveAttribute("data-key", /^N2@\d+$/);

    await page.locator('.sc-grid td[data-severity="注意"]').first().click();
    await expect(page.locator(".sc-issues li[data-selected]")).toContainText("明けの翌日");
  });

  test("貼り付けた表を読む。読めないときはわけを出す", async ({ page }) => {
    await page.goto(URL);
    const input = page.getByLabel("勤務表");
    await input.fill("名前\tユニット\n1\tA");
    await expect(page.getByRole("alert")).toContainText("日付の列がない");

    const codes = ["日", "夜", "休", ...Array(27).fill("休")];
    await input.fill([["番号", "ユニット", ...days(30)], ["7", "A", ...codes]].map((r) => r.join("\t")).join("\n"));
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByTestId("issues")).toContainText("7 の 2日の夜勤の翌日が明けでない");
  });

  test("ページから外へ通信できない（CSP）", async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute("content", /connect-src 'none'/);
    const result = await page.evaluate(() =>
      fetch("/").then(
        () => "通った",
        () => "止まった",
      ),
    );
    expect(result).toBe("止まった");
  });

  test("ページが横にはみ出さない（表は枠の中で横に送る）", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "架空の表を入れてみる" }).click();
    await expect(page.getByTestId("issues")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
