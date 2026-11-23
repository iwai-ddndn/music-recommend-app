import { expect, test } from "@playwright/test";
import { login, logout, skipOnboarding } from "./helpers";

test.beforeEach(async ({ page }) => skipOnboarding(page));
test.afterEach(async ({ page }) => logout(page));

test("未ログインでフォローするとログインを案内し、ログイン後に元の画面へ戻る", async ({ page }) => {
  await page.goto("/curators");
  await page.getByTestId("curator-card").first().getByTestId("follow-button").click();
  await expect(page.getByText("フォローにはログインが必要です")).toBeVisible();
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcurators/);
  await page.getByTestId("demo-listener").click();
  await expect(page).toHaveURL(/\/curators$/);
});

test("目利きをフォロー・解除できる", async ({ page }) => {
  await login(page, "listener");
  await page.goto("/curators");
  const card = page.getByTestId("curator-card").filter({ hasText: "@kamome_digs" });
  const button = card.getByTestId("follow-button");
  await expect(button).toHaveText("フォロー");
  await button.click();
  await expect(page.getByTestId("curator-card").filter({ hasText: "@kamome_digs" }).getByTestId("follow-button")).toHaveText(
    "フォロー中",
  );
  await page.getByTestId("curator-card").filter({ hasText: "@kamome_digs" }).getByTestId("follow-button").click();
  await expect(page.getByTestId("curator-card").filter({ hasText: "@kamome_digs" }).getByTestId("follow-button")).toHaveText(
    "フォロー",
  );
});

test("深さスライダーでキューが組み直される", async ({ page }) => {
  await page.goto("/");
  const rows = page.getByTestId("track-row");
  await expect(rows.first()).toBeVisible();
  const slider = page.getByRole("slider", { name: "深さ" }).first();
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("depth-label")).toHaveText("人気曲も");
  // 深さ0では人気曲（Big Sky Anthem）が上位に来る
  await expect(rows.first()).toContainText("Big Sky", { timeout: 5_000 });
  await page.keyboard.press("End");
  await expect(page.getByTestId("depth-label")).toHaveText("とことん無名");
  await expect(rows.first()).not.toContainText("Big Sky", { timeout: 5_000 });
});

test("アーティストが推薦を投稿し、管理者が承認すると公開される", async ({ page }) => {
  await login(page, "artist");
  await page.goto("/campaigns");
  await page.getByTestId("campaign-card").filter({ hasText: "募集中" }).click();
  await page.getByTestId("open-pitch-form").click();
  await page.getByLabel("曲のURL").fill("https://soundcloud.com/field-recording-club/cassette-heart");
  await expect(page.getByTestId("pitch-preview")).toContainText("Cassette Heart");
  const refs = page.getByLabel(/このアーティストが好きな人へ/);
  await refs.fill("Asagao");
  await refs.press("Enter");
  await page.getByLabel(/ひとこと/).fill("雨の日に");
  await page.getByRole("button", { name: "推薦を送信" }).click();
  await expect(page.getByText("推薦を送信しました")).toBeVisible();
  await expect(page.getByTestId("my-pitch").filter({ hasText: "Cassette Heart" })).toContainText("審査中");

  await logout(page);
  await login(page, "admin");
  await page.goto("/admin");
  await page.getByRole("tab", { name: /推薦審査/ }).click();
  const pitch = page.getByTestId("admin-pitch").filter({ hasText: "Cassette Heart" });
  await pitch.getByRole("button", { name: "承認" }).click();
  await expect(page.getByText("承認しました")).toBeVisible();

  await logout(page);
  await login(page, "listener");
  await page.goto("/campaigns");
  await page.getByTestId("campaign-card").filter({ hasText: "募集中" }).click();
  await expect(page.getByTestId("track-row").filter({ hasText: "Cassette Heart" })).toContainText("本人 → Asagao");
});

test("推薦できない立場のユーザーには参加方法を案内する", async ({ page }) => {
  await login(page, "listener");
  await page.goto("/campaigns");
  await page.getByTestId("campaign-card").filter({ hasText: "募集中" }).click();
  await expect(page.getByText("推薦できるのは目利きとアーティスト本人です")).toBeVisible();
  await expect(page.getByTestId("open-pitch-form")).toHaveCount(0);
});

test("管理者は目利きの申請を承認できる（X APIで x_user_id を取得）", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin");
  await page.getByRole("tab", { name: /目利き/ }).click();
  const row = page.getByTestId("admin-curator-underpass_fm");
  await expect(row).toContainText("承認待ち");
  await expect(row).toContainText("x_user_id 未取得");
  await row.getByRole("button", { name: "承認" }).click();
  await expect(page.getByTestId("admin-curator-underpass_fm")).toContainText("有効");
  await expect(page.getByTestId("admin-curator-underpass_fm")).toContainText("id 1500000000000000009");
});

test("管理者以外は管理画面に入れない", async ({ page }) => {
  await login(page, "listener");
  const res = await page.request.get("/api/admin/overview");
  expect(res.status()).toBe(403);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
});
