// Supabase（Postgres）実装。サーバー側でのみ service role キーで接続し、
// 認可はアプリ層（repo.ts / API）で行う。RLS はクライアント直アクセスへの多層防御。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Db, Filter, Insert, TableName, Tables } from "./types";

type Query = {
  eq(col: string, v: unknown): Query;
  is(col: string, v: null): Query;
  in(col: string, v: readonly unknown[]): Query;
  gte(col: string, v: unknown): Query;
  order(col: string, o: { ascending: boolean }): Query;
  limit(n: number): Query;
};

function applyEq<Q extends Query>(q: Q, eq: Record<string, unknown> | undefined): Q {
  let out = q;
  for (const [k, v] of Object.entries(eq ?? {})) {
    out = (v === null ? out.is(k, null) : out.eq(k, v)) as Q;
  }
  return out;
}

const PAGE = 1000;

export class SupabaseDb implements Db {
  readonly kind = "supabase" as const;
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async list<K extends TableName>(table: K, filter: Filter<Tables[K]> = {}) {
    const all: Tables[K][] = [];
    // limit 未指定なら全件をページングで取得
    for (let from = 0; ; from += PAGE) {
      let q = this.client.from(table).select("*") as unknown as Query;
      q = applyEq(q, filter.eq as Record<string, unknown>);
      for (const [k, vs] of Object.entries(filter.in ?? {})) {
        if ((vs as unknown[]).length === 0) return [];
        q = q.in(k, vs as unknown[]);
      }
      for (const [k, v] of Object.entries(filter.gte ?? {})) q = q.gte(k, v);
      if (filter.order) q = q.order(filter.order.column, { ascending: filter.order.ascending ?? true });
      const size = filter.limit != null ? Math.min(PAGE, filter.limit - all.length) : PAGE;
      const { data, error } = await (q as unknown as {
        range(a: number, b: number): Promise<{ data: Tables[K][] | null; error: Error | null }>;
      }).range(from, from + size - 1);
      if (error) throw error;
      all.push(...(data ?? []));
      if (!data || data.length < size) break;
      if (filter.limit != null && all.length >= filter.limit) break;
    }
    return all;
  }

  async get<K extends TableName>(table: K, id: string) {
    const { data, error } = await this.client.from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as Tables[K]) ?? null;
  }

  async insert<K extends TableName>(table: K, rows: Insert<Tables[K]>[]) {
    if (rows.length === 0) return [];
    const { data, error } = await this.client.from(table).insert(rows as never).select("*");
    if (error) throw error;
    return data as Tables[K][];
  }

  async update<K extends TableName>(table: K, eq: Partial<Tables[K]>, patch: Partial<Tables[K]>) {
    const q = applyEq(
      this.client.from(table).update(patch as never) as unknown as Query,
      eq as Record<string, unknown>,
    );
    const { data, error } = await (q as unknown as {
      select(s: string): Promise<{ data: Tables[K][] | null; error: Error | null }>;
    }).select("*");
    if (error) throw error;
    return data ?? [];
  }

  async remove<K extends TableName>(table: K, eq: Partial<Tables[K]>) {
    const q = applyEq(
      this.client.from(table).delete() as unknown as Query,
      eq as Record<string, unknown>,
    );
    const { error } = await (q as unknown as Promise<{ error: Error | null }>);
    if (error) throw error;
  }

  async upsert<K extends TableName>(
    table: K,
    rows: Insert<Tables[K]>[],
    onConflict: (keyof Tables[K] & string)[],
  ) {
    if (rows.length === 0) return [];
    const { data, error } = await this.client
      .from(table)
      .upsert(rows as never, { onConflict: onConflict.join(",") })
      .select("*");
    if (error) throw error;
    return data as Tables[K][];
  }
}
