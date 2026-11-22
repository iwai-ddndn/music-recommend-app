import { isFixtureMode } from "../env";
import { loadFixture } from "./fixtures";

export const USER_AGENT = "MinorTrackPlayer/0.1 (+batch)";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new HttpError(res.status, `${res.status} ${url}`);
  return (await res.json()) as T;
}

/** 短縮URL（on.soundcloud.com, t.co など）のリダイレクト先を解決する */
export async function resolveRedirect(url: string): Promise<string> {
  if (isFixtureMode()) {
    const map = loadFixture<Record<string, string>>("redirects.json");
    const to = map[url];
    if (!to) throw new Error("redirect_not_found");
    return to;
  }
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  return res.url || url;
}
