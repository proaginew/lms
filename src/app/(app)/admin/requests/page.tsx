import { redirect } from "next/navigation";
import AccessRequestsTable from "@/components/AccessRequestsTable";
import { getCurrentAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN") redirect("/");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Access requests</h2>
        <p className="mt-1 text-sm text-gray-500">
          Approve, reject, or revoke course access. Changes apply immediately in the app.
        </p>
      </div>
      <AccessRequestsTable />
    </div>
  );
}
