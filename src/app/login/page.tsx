import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "@/components/login-view";

export const metadata: Metadata = { title: "ログイン" };

export default function Page() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
