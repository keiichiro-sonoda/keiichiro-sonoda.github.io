import { expect, test, type Page } from "@playwright/test";

const URL = "/2023/07/11/tsp-ga.html";

const num = async (page: Page, id: string) => Number((await page.getByTestId(id).textContent())!.replace(/[^\d.]/g, ""));
const generation = (page: Page) => num(page, "generation");

async function ready(page: Page) {
  await page.goto(URL);
  await expect(page.getByTestId("status")).toHaveText("一時停止");
}

test.describe("巡回セールスマンの実験台", () => {
  test("開くと世代0の状態が描かれる", async ({ page }) => {
    await ready(page);
    await expect(page.getByTestId("generation")).toHaveText("0");
    expect(await num(page, "best")).toBeGreaterThan(0);
    // 舞台に何か描かれている（全部透明ではない）
    const painted = await page.getByTestId("route-canvas").evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    expect(painted).toBeGreaterThan(1000);
  });

  test("開始で世代が進み、最短距離が縮み、一時停止で止まる", async ({ page }) => {
    await ready(page);
    const before = await num(page, "best");
    await page.getByTestId("toggle").click();
    await expect(page.getByTestId("status")).toHaveText("進化中");
    await expect.poll(() => generation(page), { timeout: 10_000 }).toBeGreaterThan(100);
    expect(await num(page, "best")).toBeLessThan(before);
    await expect(page.getByTestId("speed")).toHaveText(/^[1-9][\d,]*$/);

    await page.getByTestId("toggle").click();
    await expect(page.getByTestId("status")).toHaveText("一時停止");
    const stopped = await generation(page);
    await page.waitForTimeout(600);
    expect(await generation(page)).toBe(stopped);
  });

  test("進化の最中も画面のスレッドが固まらない（長いタスクが無く、描画が続き、ボタンがすぐ効く）", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(e.duration);
      }).observe({ type: "longtask", buffered: false });
    });
    await ready(page);
    // 重めの設定にし、速さの上限も外す（元の実装では、これで画面が固まった）
    await page.getByTestId("count").fill("400");
    await page.getByTestId("population").fill("500");
    await page.getByTestId("speed-max").click();
    await expect(page.getByTestId("status")).toHaveText("一時停止");
    await page.evaluate(() => ((window as unknown as { __long: number[] }).__long = []));

    await page.getByTestId("toggle").click();
    await expect(page.getByTestId("status")).toHaveText("進化中");
    // 2秒のあいだ、画面のフレームがどれだけ回るか
    const frames = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let n = 0;
          const end = performance.now() + 2000;
          const loop = () => {
            n++;
            if (performance.now() < end) requestAnimationFrame(loop);
            else resolve(n);
          };
          requestAnimationFrame(loop);
        }),
    );
    expect(frames).toBeGreaterThan(60); // 30fps 以上
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    expect(Math.max(0, ...long)).toBeLessThan(200);
    expect(await generation(page)).toBeGreaterThan(0);

    const t0 = Date.now();
    await page.getByTestId("toggle").click();
    await expect(page.getByTestId("status")).toHaveText("一時停止");
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test("測り方の確認: 画面のスレッドを塞ぐと、長いタスクとして検出される（上のテストが素通りしていないこと）", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(e.duration);
      }).observe({ type: "longtask", buffered: false });
    });
    await ready(page);
    // 元の実装のように、画面のスレッドで 400ms 計算し続ける。
    // page.evaluate の中で直接回すと開発者ツールの経路で動き、ページのタスクとして数えられない。ページのタイマーから回す
    await page.evaluate(() =>
      setTimeout(() => {
        const end = performance.now() + 400;
        while (performance.now() < end);
      }, 0),
    );
    await expect.poll(() => page.evaluate(() => Math.max(0, ...(window as unknown as { __long: number[] }).__long))).toBeGreaterThan(200);
  });

  test("1世代すすめると、世代がちょうど1増える", async ({ page }) => {
    await ready(page);
    await page.getByTestId("step").click();
    await expect(page.getByTestId("generation")).toHaveText("1");
    await page.getByTestId("step").click();
    await expect(page.getByTestId("generation")).toHaveText("2");
  });

  test("同じシードなら同じ進化をたどる（最初から、で同じ結果になる）", async ({ page }) => {
    await ready(page);
    await page.getByTestId("seed").fill("12345");
    await page.getByTestId("seed").press("Enter");
    await expect(page.getByTestId("generation")).toHaveText("0");
    for (let i = 0; i < 5; i++) await page.getByTestId("step").click();
    await expect(page.getByTestId("generation")).toHaveText("5");
    const first = await page.getByTestId("best").textContent();

    await page.getByTestId("restart").click();
    await expect(page.getByTestId("generation")).toHaveText("0");
    for (let i = 0; i < 5; i++) await page.getByTestId("step").click();
    await expect(page.getByTestId("generation")).toHaveText("5");
    expect(await page.getByTestId("best").textContent()).toBe(first);
  });

  test("配置を変えると、シードが変わって世代0に戻る", async ({ page }) => {
    await ready(page);
    const seed = await page.getByTestId("seed").inputValue();
    await page.getByTestId("step").click();
    await page.getByTestId("reshuffle").click();
    await expect(page.getByTestId("generation")).toHaveText("0");
    expect(await page.getByTestId("seed").inputValue()).not.toBe(seed);
  });

  test("円の配置では、理論上の最短に近づいていく", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: "円", exact: true }).click();
    await page.getByTestId("count").fill("20");
    await page.getByTestId("speed-fast").click();
    await expect(page.getByTestId("gap")).toBeVisible();
    await expect(page.getByText(/理論上の最短 \d/)).toBeVisible();
    await page.getByTestId("toggle").click();
    await expect.poll(() => num(page, "gap"), { timeout: 15_000 }).toBeLessThan(1);
  });

  test("速さを切り替えられる（ゆっくりは上限を守り、全力はずっと速い）", async ({ page }) => {
    await ready(page);
    await expect(page.getByTestId("speed-normal")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("speed-slow").click();
    await page.getByTestId("toggle").click();
    await page.waitForTimeout(2000);
    const slow = await generation(page);
    expect(slow).toBeGreaterThan(5);
    expect(slow).toBeLessThanOrEqual(50); // 20 世代/秒 × 2 秒 ＋ 余裕

    await page.getByTestId("speed-max").click();
    const g = await generation(page);
    await page.waitForTimeout(1000);
    expect((await generation(page)) - g).toBeGreaterThan(200);
  });

  test.describe("数値の入力欄", () => {
    test("打っている途中では確定せず、Enter で確定する（スライダーも動く）", async ({ page }) => {
      await ready(page);
      await page.getByTestId("step").click();
      await expect(page.getByTestId("generation")).toHaveText("1");
      const box = page.getByTestId("count-input");
      await box.click();
      await box.pressSequentially("120");
      // 「1」「12」の途中で都市を作り直していない
      await page.waitForTimeout(300);
      await expect(page.getByTestId("generation")).toHaveText("1");
      await box.press("Enter");
      await expect(page.getByTestId("generation")).toHaveText("0");
      await expect(page.getByTestId("count")).toHaveValue("120");
      await expect(box).toHaveValue("120");
    });

    test("フォーカスが外れても確定する", async ({ page }) => {
      await ready(page);
      await page.getByTestId("tournament-input").fill("7");
      await page.getByTestId("tournament-input").blur();
      await expect(page.getByTestId("tournament")).toHaveValue("7");
    });

    test("範囲の外は端に寄せる（入力欄はスライダーより広い範囲まで受け付ける）", async ({ page }) => {
      await ready(page);
      const box = page.getByTestId("population-input");
      await box.fill("5000");
      await box.press("Enter");
      await expect(box).toHaveValue("1000"); // 入力欄の上限
      await expect(page.getByTestId("population")).toHaveValue("500"); // スライダーは右端
      await box.fill("3");
      await box.press("Enter");
      await expect(box).toHaveValue("10");
    });

    test("読めない値は元に戻り、Esc は打ちかけを取り消す", async ({ page }) => {
      await ready(page);
      const box = page.getByTestId("mutation-input");
      await box.fill("abc");
      await box.press("Enter");
      await expect(box).toHaveValue("25");
      await box.fill("90");
      await box.press("Escape");
      await expect(box).toHaveValue("25");
      await expect(page.getByTestId("mutation")).toHaveValue("0.25");
    });

    test("% の欄は、確率に直して反映する", async ({ page }) => {
      await ready(page);
      const box = page.getByTestId("mutation-input");
      await box.fill("37");
      await box.press("Enter");
      await expect(page.getByTestId("mutation")).toHaveValue("0.37");
    });

    test("↑↓ はすぐ反映し、Shift つきなら10刻み", async ({ page }) => {
      await ready(page);
      const t = page.getByTestId("tournament-input");
      await t.focus();
      await t.press("ArrowUp");
      await expect(page.getByTestId("tournament")).toHaveValue("4");
      await t.press("ArrowDown");
      await t.press("ArrowDown");
      await expect(t).toHaveValue("2");
      await t.press("ArrowDown"); // 下限より下には行かない
      await expect(t).toHaveValue("2");

      const c = page.getByTestId("count-input");
      await c.focus();
      await c.press("Shift+ArrowUp");
      await expect(c).toHaveValue("90");
      await expect(page.getByTestId("generation")).toHaveText("0");
    });

    test("シードも、打っている途中では作り直さない", async ({ page }) => {
      await ready(page);
      await page.getByTestId("step").click();
      const seed = page.getByTestId("seed");
      await seed.click();
      await seed.press("End");
      await seed.pressSequentially("9");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("generation")).toHaveText("1");
      await seed.press("Enter");
      await expect(page.getByTestId("generation")).toHaveText("0");
    });
  });

  test("二重の円では、内側の円の大きさを選べる", async ({ page }) => {
    await ready(page);
    await expect(page.getByTestId("inner")).toHaveCount(0);
    await page.getByRole("button", { name: "二重の円" }).click();
    await expect(page.getByTestId("inner")).toBeVisible();
    await page.getByTestId("inner-input").fill("33");
    await page.getByTestId("inner-input").press("Enter");
    await expect(page.getByTestId("inner")).toHaveValue("0.33");
  });

  test("動かしたままパラメータを変えても止まらない", async ({ page }) => {
    await ready(page);
    await page.getByTestId("toggle").click();
    await page.getByTestId("population").fill("300");
    await page.getByTestId("mutation").fill("0.8");
    await page.getByTestId("tournament").fill("6");
    await page.getByTestId("elitism").uncheck();
    const g = await generation(page);
    await expect.poll(() => generation(page)).toBeGreaterThan(g);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByTestId("status")).toHaveText("進化中");
  });

  test("横にはみ出さず、外部への通信も、コンソールのエラーも無い", async ({ page }) => {
    const errors: string[] = [];
    const external: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      const host = new globalThis.URL(r.url()).host;
      if (!host.startsWith("127.0.0.1") && !host.endsWith("googleapis.com") && !host.endsWith("gstatic.com")) external.push(r.url());
    });
    await ready(page);
    await page.getByTestId("toggle").click();
    await expect.poll(() => generation(page)).toBeGreaterThan(20);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
});
