import type { Metadata } from "next";
import { CuratorsView } from "@/components/curators/curators-view";

export const metadata: Metadata = { title: "目利き" };

export default function Page() {
  return <CuratorsView />;
}
