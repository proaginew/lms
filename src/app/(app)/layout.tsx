import { Suspense } from "react";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/signin");
  }
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--yt-bg)] p-6 text-sm text-[var(--yt-muted)]">
          Loading…
        </div>
      }
    >
      <AppShell role={user.role}>{children}</AppShell>
    </Suspense>
  );
}
