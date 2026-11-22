import { Suspense } from "react";
import { ListSkeleton } from "@/components/common";
import { CampaignDetailView } from "@/components/campaigns/campaign-detail-view";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignDetailView id={id} />;
}

export default function Page(props: PageProps<"/campaigns/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Detail params={props.params} />
    </Suspense>
  );
}
