// USE_FIXTURES=true 用のローカルDB。JSONファイル1つに全テーブルを保存する。
// Next.js プロセスとバッチスクリプトで状態を共有できるよう、更新ごとにファイルへ書き出す。
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TABLE_NAMES, type Db, type Filter, type Insert, type TableName, type Tables } from "./types";

export type LocalData = { [K in TableName]: Tables[K][] };

export function emptyData(): LocalData {
  return Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as LocalData;
}

function matchesEq(row: Record<string, unknown>, eq: Record<string, unknown> | undefined) {
  if (!eq) return true;
  return Object.entries(eq).every(([k, v]) => (v === null ? row[k] == null : row[k] === v));
}

export function applyFilter<T>(rows: T[], filter: Filter<T> = {}): T[] {
  let out = rows.filter((r) => {
    const row = r as Record<string, unknown>;
    if (!matchesEq(row, filter.eq as Record<string, unknown>)) return false;
    for (const [k, vs] of Object.entries(filter.in ?? {})) {
      if (!(vs as unknown[]).includes(row[k])) return false;
    }
    for (const [k, v] of Object.entries(filter.gte ?? {})) {
      const cur = row[k] as string | number | null;
      if (cur == null || cur < (v as string | number)) return false;
    }
    return true;
  });
  if (filter.order) {
    const { column, ascending = true } = filter.order;
    out = [...out].sort((a, b) => {
      const av = (a as Record<string, unknown>)[column] as string | number;
      const bv = (b as Record<string, unknown>)[column] as string | number;
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
    });
  }
  if (filter.limit != null) out = out.slice(0, filter.limit);
  return out;
}

export class LocalDb implements Db {
  readonly kind = "local" as const;
  private data: LocalData | null = null;
  private mtime = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly init: () => LocalData | Promise<LocalData>,
  ) {}

  private async load(): Promise<LocalData> {
    if (fs.existsSync(this.file)) {
      const stat = fs.statSync(this.file);
      if (!this.data || stat.mtimeMs !== this.mtime) {
        const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<LocalData>;
        this.data = { ...emptyData(), ...parsed };
        this.mtime = stat.mtimeMs;
      }
      return this.data;
    }
    this.data = { ...emptyData(), ...(await this.init()) };
    this.save();
    return this.data;
  }

  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
    this.mtime = fs.statSync(this.file).mtimeMs;
  }

  /** 書き込みを直列化する */
  private serial<R>(fn: () => Promise<R>): Promise<R> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  async list<K extends TableName>(table: K, filter?: Filter<Tables[K]>) {
    const data = await this.load();
    return structuredClone(applyFilter(data[table], filter));
  }

  async get<K extends TableName>(table: K, id: string) {
    const data = await this.load();
    const row = data[table].find((r) => r.id === id);
    return row ? structuredClone(row) : null;
  }

  insert<K extends TableName>(table: K, rows: Insert<Tables[K]>[]) {
    return this.serial(async () => {
      const data = await this.load();
      const created = rows.map(
        (r) =>
          ({
            ...r,
            id: r.id ?? randomUUID(),
            created_at: r.created_at ?? new Date().toISOString(),
          }) as unknown as Tables[K],
      );
      (data[table] as Tables[K][]).push(...created);
      this.save();
      return structuredClone(created);
    });
  }

  update<K extends TableName>(table: K, eq: Partial<Tables[K]>, patch: Partial<Tables[K]>) {
    return this.serial(async () => {
      const data = await this.load();
      const updated: Tables[K][] = [];
      for (const row of data[table]) {
        if (matchesEq(row as Record<string, unknown>, eq as Record<string, unknown>)) {
          Object.assign(row, patch);
          updated.push(row as Tables[K]);
        }
      }
      if (updated.length) this.save();
      return structuredClone(updated);
    });
  }

  remove<K extends TableName>(table: K, eq: Partial<Tables[K]>) {
    return this.serial(async () => {
      const data = await this.load();
      const before = data[table].length;
      (data as Record<string, unknown[]>)[table] = data[table].filter(
        (r) => !matchesEq(r as Record<string, unknown>, eq as Record<string, unknown>),
      );
      if (data[table].length !== before) this.save();
    });
  }

  upsert<K extends TableName>(
    table: K,
    rows: Insert<Tables[K]>[],
    onConflict: (keyof Tables[K] & string)[],
  ) {
    return this.serial(async () => {
      const data = await this.load();
      const out: Tables[K][] = [];
      for (const r of rows) {
        const rec = r as Record<string, unknown>;
        const existing = data[table].find((row) =>
          onConflict.every((c) => (row as Record<string, unknown>)[c] === rec[c]),
        );
        if (existing) {
          const { id: _id, created_at: _c, ...rest } = rec;
          void _id;
          void _c;
          Object.assign(existing, rest);
          out.push(existing as Tables[K]);
        } else {
          const created = {
            ...rec,
            id: (rec.id as string) ?? randomUUID(),
            created_at: (rec.created_at as string) ?? new Date().toISOString(),
          } as unknown as Tables[K];
          (data[table] as Tables[K][]).push(created);
          out.push(created);
        }
      }
      this.save();
      return structuredClone(out);
    });
  }
}
