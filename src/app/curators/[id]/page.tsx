import { Suspense } from "react";
import { ListSkeleton } from "@/components/common";
import { CuratorDetailView } from "@/components/curators/curator-detail-view";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CuratorDetailView id={id} />;
}

export default function Page(props: PageProps<"/curators/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Detail params={props.params} />
    </Suspense>
  );
}
