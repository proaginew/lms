import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import AdminFeesPanel from "@/components/AdminFeesPanel";

export const dynamic = "force-dynamic";

export default async function AdminFeesPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN") redirect("/");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Fees</h2>
        <p className="yt-meta mt-1">
          Manage fee structures, invoices, and record manual payments.
        </p>
      </div>
      <AdminFeesPanel />
    </div>
  );
}
