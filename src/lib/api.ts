import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError } from "./auth/session";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Route Handler の共通エラーハンドリング */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        return json({ error: e.issues.map((i) => i.message).join(" / ") }, { status: 400 });
      }
      console.error(e);
      return json({ error: "サーバーエラーが発生しました" }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "リクエストが不正です");
  }
  return schema.parse(raw);
}
