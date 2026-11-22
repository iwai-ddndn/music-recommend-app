"use client";

import useSWR from "swr";
import type { SessionUser } from "../types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "読み込みに失敗しました");
  return data as T;
}

export async function apiSend<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "通信に失敗しました");
  return data as T;
}

export type MeResponse = {
  user: SessionUser | null;
  stats: { follows: number; favorites: number } | null;
  mode: "fixtures" | "live";
};

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<MeResponse>("/api/me", fetcher, {
    revalidateOnFocus: false,
  });
  return { user: data?.user ?? null, stats: data?.stats ?? null, mode: data?.mode, loading: isLoading, error, mutate };
}
