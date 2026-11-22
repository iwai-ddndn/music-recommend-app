// 環境変数の読み出し。USE_FIXTURES=true のときは外部APIを呼ばず fixtures/ を使う。
// Supabase の設定が無い場合も自動的に fixtures モードになる（ローカル開発用）。

export function isFixtureMode(): boolean {
  const v = process.env.USE_FIXTURES;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export const env = {
  get appleTeamId() {
    return process.env.APPLE_TEAM_ID ?? "";
  },
  get appleKeyId() {
    return process.env.APPLE_KEY_ID ?? "";
  },
  get applePrivateKey() {
    return (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  },
  get xBearerToken() {
    return process.env.X_BEARER_TOKEN ?? "";
  },
  get xMonthlyBudgetUsd() {
    const n = Number(process.env.X_MONTHLY_BUDGET_USD);
    return Number.isFinite(n) && n > 0 ? n : 0;
  },
  get lastfmApiKey() {
    return process.env.LASTFM_API_KEY ?? "";
  },
  get soundcloudClientId() {
    return process.env.SOUNDCLOUD_CLIENT_ID ?? "";
  },
  get soundcloudClientSecret() {
    return process.env.SOUNDCLOUD_CLIENT_SECRET ?? "";
  },
  get supabaseUrl() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  },
  get supabaseAnonKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  },
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  },
  /** ローカルDBファイル（fixtures モード） */
  get localDbFile() {
    return process.env.LOCAL_DB_FILE ?? ".data/local-db.json";
  },
  get contactEmail() {
    return process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";
  },
};
