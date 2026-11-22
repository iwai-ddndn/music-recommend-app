import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { listCampaigns } from "@/lib/repo/campaigns";

export const GET = handler(async () => {
  await requireUser(["admin"]);
  return json({ campaigns: await listCampaigns(await getReadyDb(), { includeDraft: true }) });
});

export const CampaignInput = z
  .object({
    title: z.string().trim().min(1, "タイトルを入力してください").max(100),
    description: z.string().trim().max(2000).default(""),
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    max_pitches_per_user: z.number().int().min(1).max(20).default(3),
    status: z.enum(["draft", "open", "closed"]).default("draft"),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), "終了日時は開始日時より後にしてください");

export const POST = handler(async (req: Request) => {
  await requireUser(["admin"]);
  const input = await body(req, CampaignInput);
  const [campaign] = await (await getReadyDb()).insert("campaigns", [input]);
  return json({ campaign }, { status: 201 });
});
