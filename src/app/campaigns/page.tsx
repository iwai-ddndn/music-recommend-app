import type { Metadata } from "next";
import { CampaignsView } from "@/components/campaigns/campaigns-view";

export const metadata: Metadata = { title: "推薦キャンペーン" };

export default function Page() {
  return <CampaignsView />;
}
