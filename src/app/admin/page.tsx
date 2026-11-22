import type { Metadata } from "next";
import { AdminView } from "@/components/admin/admin-view";

export const metadata: Metadata = { title: "管理" };

export default function Page() {
  return <AdminView />;
}
