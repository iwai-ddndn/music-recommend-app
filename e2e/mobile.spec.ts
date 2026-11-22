import { expect, test } from "@playwright/test";

test("スマホ: ミニプレイヤーから再生パネルを開閉でき、下部タブで移動しても再生が続く", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("track-row").first().click();
  const mini = page.getByTestId("mini-player");
  await expect(mini).toBeVisible();
  const title = await page.getByTestId("track-row").first().getByTestId("track-title").textContent();
  await expect(mini).toContainText(title!);

  await mini.getByRole("button", { name: "再生パネルを開く" }).click();
  await expect(page.getByTestId("now-title")).toBeInViewport();
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("now-title")).not.toBeInViewport();

  await page.getByRole("navigation", { name: "メイン" }).getByRole("link", { name: "目利き" }).click();
  await expect(page).toHaveURL(/\/curators/);
  await expect(page.getByTestId("mini-player")).toBeVisible();
  await expect(page.getByTestId("now-playing")).toHaveAttribute("data-status", /playing|loading/);
});
