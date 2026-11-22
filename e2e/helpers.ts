import fs from "node:fs";
import { expect, type Page } from "@playwright/test";

export const USERS = {
  listener: "00000000-0000-4000-8000-000000000001",
  curator: "00000000-0000-4000-8000-000000000002",
  artist: "00000000-0000-4000-8000-000000000003",
  admin: "00000000-0000-4000-8000-000000000004",
} as const;

export async function login(page: Page, who: keyof typeof USERS) {
  const res = await page.request.post("/api/auth/demo", { data: { user_id: USERS[who] } });
  expect(res.ok()).toBeTruthy();
}

export async function logout(page: Page) {
  await page.request.post("/api/auth/logout");
}

type Row = { title: string; services: string[] };

/** 発見のキューの各行（タイトルと再生可能サービス） */
export async function readRows(page: Page): Promise<Row[]> {
  const rows = page.getByTestId("track-row");
  await expect(rows.first()).toBeVisible();
  return rows.evaluateAll((els) =>
    els.map((el) => ({
      title: el.querySelector("[data-testid=track-title]")?.textContent?.trim() ?? "",
      services: [...el.querySelectorAll("span[title]")].map((s) => s.getAttribute("title") ?? ""),
    })),
  );
}

export function nowTitle(page: Page) {
  return page.getByTestId("now-title");
}

export function readDb(): {
  listen_events: { track_id: string; event: string; user_id: string; context: string }[];
  tracks: { id: string; title: string }[];
} {
  return JSON.parse(fs.readFileSync(".data/e2e-db.json", "utf8"));
}
