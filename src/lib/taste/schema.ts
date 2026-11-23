import { z } from "zod";

const vector = z.record(z.string().max(40), z.number().min(-5).max(5));

/** 端末から送られてくる好み（scoring/taste.ts の Taste） */
export const TasteSchema = z.object({
  seeds: vector.default({}),
  learned: vector.default({}),
  curators: vector.default({}),
  softFollows: z.array(z.string().max(64)).max(20).default([]),
  signals: z.number().min(0).max(100000).default(0),
  updatedAt: z.string().nullable().default(null),
});
