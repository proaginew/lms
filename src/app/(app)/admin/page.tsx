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
        <h2 className="text-2xl font-semibold text-gray-900">Admin dashboard</h2>
        <p className="mt-1 text-sm text-gray-500">
          Review access requests, active learners, and analytics.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-brand-200"
          >
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{card.value}</p>
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Active learners</h3>
          <Link href="/admin/analytics" className="text-sm text-brand-600 hover:underline">
            Full analytics
          </Link>
        </div>
        {active.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            Nobody is watching right now.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Learner</th>
                  <th className="px-4 py-3">Watching</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Course</th>
                </tr>
              </thead>
              <tbody>
                {active.slice(0, 8).map((row) => (
                  <tr key={row.userId} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.name || "Learner"}</div>
                      <div className="text-xs text-gray-500">{row.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.videoTitle}</td>
                    <td className="px-4 py-3 text-gray-600">{row.subject}</td>
                    <td className="px-4 py-3 text-gray-600">{row.courseName}</td>
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
