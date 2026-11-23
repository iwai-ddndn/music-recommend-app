import { expect, test } from "@playwright/test";

test("初回: シーンとアーティストをタップで選ぶと、そのまま再生が始まり、好みと合う目利きがホームに出る", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await expect(page.getByTestId("onboarding-next")).toBeDisabled();
  await page.getByTestId("scene-ambient").click();
  await page.getByTestId("scene-folk").click();
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("anchor").first().click();
  await page.getByTestId("onboarding-start").click();

  // そのまま1曲目が鳴り、全画面プレイヤーが開く
  await expect(page.getByTestId("now-playing")).toHaveAttribute("data-status", "playing");
  await expect(page.getByTestId("now-title")).toBeInViewport();
  await page.getByRole("button", { name: "閉じる" }).click();

  // 選んだ好みがチップで見える
  const chips = page.getByTestId("taste-chips");
  await expect(chips).toContainText("アンビエント");
  await expect(chips).toContainText("フォーク");

  // 端末に保存され、再読み込みしてもオンボーディングは出ない
  await page.reload();
  await expect(page.getByTestId("track-row").first()).toBeVisible();
  await expect(page.getByTestId("onboarding")).toHaveCount(0);
});

test("初回: スキップしてもすぐ聴ける", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "スキップ" }).click();
  await expect(page.getByTestId("track-row").first()).toBeVisible();
});
