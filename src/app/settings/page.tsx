import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/settings-view";

export const metadata: Metadata = { title: "設定" };

export default function Page() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
