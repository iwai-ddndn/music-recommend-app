import { cookies } from "next/headers";
import { handler, json } from "@/lib/api";
import { DEMO_COOKIE } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/auth/supabase-server";
import { useFixtures } from "@/lib/env";

export const POST = handler(async () => {
  if (useFixtures()) {
    (await cookies()).delete(DEMO_COOKIE);
  } else {
    await (await supabaseServer()).auth.signOut();
  }
  return json({ ok: true });
});
