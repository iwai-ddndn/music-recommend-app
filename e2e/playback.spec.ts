import { expect, test } from "@playwright/test";
import { login, logout, nowTitle, readDb, readRows } from "./helpers";

// 統一キューの再生フロー（仕様書 7章）。fixtures モードでは各サービスの再生を模擬し、1曲2秒で終わる。

test.describe("再生フロー", () => {
  test.afterEach(async ({ page }) => logout(page));

  test("ログイン不要で再生でき、曲が終わると次の曲へ自動で進む", async ({ page }) => {
    await page.goto("/");
    const rows = await readRows(page);
    // 自動送りできる（Bandcamp だけではない）曲が2曲続く位置を探す
    const i = rows.findIndex(
      (r, k) => k + 1 < rows.length && r.services[0] !== "Bandcamp" && rows[k + 1].services[0] !== "Bandcamp",
    );
    expect(i).toBeGreaterThanOrEqual(0);
    await page.getByTestId("track-row").nth(i).click();
    await expect(nowTitle(page)).toHaveText(rows[i].title);
    await expect(page.getByTestId("now-playing")).toHaveAttribute("data-status", "playing");
    // 2秒で終わり、次の曲へ
    await expect(nowTitle(page)).toHaveText(rows[i + 1].title, { timeout: 8_000 });
    await expect(page.getByTestId("now-playing")).toHaveAttribute("data-status", "playing");
  });

  test("次が Bandcamp ならカードを出して停止し、「スキップ」で次へ進む。反応は listen_events に記録される", async ({ page }) => {
    await login(page, "listener");
    await page.goto("/");
    const rows = await readRows(page);
    const bc = rows.findIndex(
      (r, k) => k > 0 && r.services.length === 1 && r.services[0] === "Bandcamp" && rows[k - 1].services[0] !== "Bandcamp",
    );
    expect(bc).toBeGreaterThan(0);
    await page.getByTestId("track-row").nth(bc - 1).click();
    await expect(nowTitle(page)).toHaveText(rows[bc - 1].title);

    // 前の曲が終わると Bandcamp の曲で止まる
    await expect(nowTitle(page)).toHaveText(rows[bc].title, { timeout: 8_000 });
    await expect(page.getByTestId("bandcamp-card")).toBeVisible();
    await expect(page.getByTestId("now-playing")).toHaveAttribute("data-status", "awaiting_user");
    await page.waitForTimeout(3_000);
    await expect(nowTitle(page)).toHaveText(rows[bc].title); // 勝手に進まない
    await expect(page.getByTestId("open-original")).toHaveText(/購入ページへ/);

    await page.getByTestId("bandcamp-card").getByRole("button", { name: "スキップ" }).click();
    await expect(nowTitle(page)).toHaveText(rows[bc + 1].title);

    // 記録: 前の曲は play と complete、Bandcamp の曲は skip のみ（完聴は判定しない）
    await expect
      .poll(() => {
        const db = readDb();
        const id = (title: string) => db.tracks.find((t) => t.title === title)?.id;
        const ev = (title: string) =>
          db.listen_events.filter((e) => e.track_id === id(title)).map((e) => e.event).sort();
        return { prev: ev(rows[bc - 1].title), bandcamp: ev(rows[bc].title) };
      })
      .toEqual({ prev: ["complete", "play"], bandcamp: ["skip"] });
  });

  test("自動送りで再生が始まらなければ「タップして続きを再生」を出して停止する", async ({ page }) => {
    await page.addInitScript(() => {
      window.__SIM_BLOCK_AUTOPLAY = true;
    });
    await page.goto("/");
    const rows = await readRows(page);
    const i = rows.findIndex(
      (r, k) => k + 1 < rows.length && r.services[0] !== "Bandcamp" && rows[k + 1].services[0] !== "Bandcamp",
    );
    await page.getByTestId("track-row").nth(i).click();
    await expect(page.getByTestId("now-playing")).toHaveAttribute("data-status", "playing");
    await expect(nowTitle(page)).toHaveText(rows[i + 1].title, { timeout: 8_000 });
    const tap = page.getByTestId("tap-to-continue");
    await expect(tap).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("now-playing")).toHaveAttribute("data-status", "blocked");
    await tap.click();
    await expect(page.getByTestId("now-playing")).toHaveAttribute("data-status", "playing");
  });

  test("一度聴いた（完聴・スキップした）曲は次のキューから外れる", async ({ page }) => {
    await login(page, "listener");
    const before = await (await page.request.get("/api/feed")).json();
    const db = readDb();
    const listenedIds = new Set(
      db.listen_events.filter((e) => e.event === "complete" || e.event === "skip").map((e) => e.track_id),
    );
    expect(listenedIds.size).toBeGreaterThan(0);
    for (const item of before.items as { track_id: string }[]) {
      expect(listenedIds.has(item.track_id)).toBe(false);
    }
  });
});
