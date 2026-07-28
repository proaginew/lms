import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import SuccessStoriesAdmin from "@/components/SuccessStoriesAdmin";

export const dynamic = "force-dynamic";

export default async function AdminSuccessStoriesPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN") redirect("/");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Success stories</h2>
        <p className="yt-meta mt-1">Placement highlights shown to students.</p>
      </div>
      <SuccessStoriesAdmin />
    </div>
  );
}
