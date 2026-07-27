import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/auth";
import { getActiveLearners } from "@/lib/analytics";
import { listOneDriveCourses } from "@/lib/graph";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/signin");
  }
  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const [pending, users, approved, active] = await Promise.all([
    prisma.accessRequest.count({ where: { status: "PENDING" } }),
    prisma.user.count(),
    prisma.accessRequest.count({ where: { status: "APPROVED" } }),
    getActiveLearners(),
  ]);

  let courseCount = 0;
  try {
    const listed = await listOneDriveCourses();
    courseCount = listed.courses.length;
  } catch {
    courseCount = 0;
  }

  const cards = [
    { label: "Active now", value: active.length, href: "/admin/analytics" },
    { label: "Pending requests", value: pending, href: "/admin/requests" },
    { label: "Approved grants", value: approved, href: "/admin/requests" },
    { label: "Users", value: users, href: "/admin/users" },
    { label: "Courses", value: courseCount, href: "/" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Dashboard</h2>
        <p className="yt-meta mt-1">Review access requests, active learners, and analytics.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="yt-card p-5 hover:bg-[#f2f2f2]">
            <p className="yt-meta">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold">{card.value}</p>
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Active learners</h3>
          <Link href="/admin/analytics" className="text-sm text-[var(--yt-muted)] hover:underline">
            Full analytics
          </Link>
        </div>
        {active.length === 0 ? (
          <p className="yt-card p-6 yt-meta">Nobody is watching right now.</p>
        ) : (
          <div className="yt-card overflow-hidden">
            <table className="yt-table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Watching</th>
                  <th>Subject</th>
                  <th>Course</th>
                </tr>
              </thead>
              <tbody>
                {active.slice(0, 8).map((row) => (
                  <tr key={row.userId}>
                    <td>
                      <div className="font-medium">{row.name || "Learner"}</div>
                      <div className="text-xs text-[var(--yt-muted)]">{row.email}</div>
                    </td>
                    <td>{row.videoTitle}</td>
                    <td>{row.subject}</td>
                    <td>{row.courseName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
