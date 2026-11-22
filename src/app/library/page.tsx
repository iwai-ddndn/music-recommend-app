import type { Metadata } from "next";
import { LibraryView } from "@/components/library-view";

export const metadata: Metadata = { title: "ライブラリ" };

export default function Page() {
  return <LibraryView />;
}
