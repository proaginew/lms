import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import AnnouncementsAdmin from "@/components/AnnouncementsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN") redirect("/");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Announcements</h2>
        <p className="yt-meta mt-1">Banners shown on the student home page.</p>
      </div>
      <AnnouncementsAdmin />
    </div>
  );
}
