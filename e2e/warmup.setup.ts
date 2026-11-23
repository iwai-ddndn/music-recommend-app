import { test } from "@playwright/test";

// dev サーバーは初回アクセス時に各ルートをコンパイルする（＋ローカルDBの初期化）。
// 本番のテストがその待ち時間でタイムアウトしないよう、先に主要なルートを開いておく。
test("warm up routes", async ({ page, request }) => {
  test.setTimeout(240_000);
  await request.get("/api/feed");
  await request.get("/api/admin/overview");
  for (const path of ["/", "/curators", "/campaigns", "/library", "/login", "/settings", "/admin"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
  }
  const campaigns = await (await request.get("/api/campaigns")).json();
  const curators = await (await request.get("/api/curators")).json();
  await page.goto(`/campaigns/${campaigns.campaigns[0].id}`, { waitUntil: "domcontentloaded" });
  await page.goto(`/curators/${curators.curators[0].id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
});
