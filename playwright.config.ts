import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
export const E2E_DB = ".data/e2e-db.json";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    // 事前インストール済みの Chromium を使う
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile/ },
  ],
  webServer: {
    // 毎回まっさらなローカルDBから始める（初回アクセスでシードとバッチが流れる）
    // CI では本番ビルドで動かす（dev の初回コンパイル待ちによる揺らぎを避ける）
    command: `node -e "require('fs').rmSync('${E2E_DB}',{force:true})" && ${
      process.env.CI ? `npx next build && npx next start -p ${PORT}` : `npx next dev -p ${PORT}`
    }`,
    url: `http://localhost:${PORT}/api/me`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      USE_FIXTURES: "true",
      LOCAL_DB_FILE: E2E_DB,
      FIXTURES_DIR: "fixtures/e2e",
      // E2E は外部に出ない: 再生は模擬、プレビュー音源の解決もしない
      NEXT_PUBLIC_PLAYER_MODE: "simulated",
      NEXT_PUBLIC_SIM_DURATION_SEC: "2",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
