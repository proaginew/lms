import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/signin");
  }
  return <AppShell role={user.role}>{children}</AppShell>;
}
