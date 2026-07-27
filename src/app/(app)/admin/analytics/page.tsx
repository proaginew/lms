import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { getAdminAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN") redirect("/");

  const analytics = await getAdminAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Analytics</h2>
        <p className="mt-1 text-sm text-gray-500">
          Active learners and viewing analytics across all subjects.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Active now</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {analytics.summary.activeNow}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total watch time</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {analytics.summary.totalWatchLabel}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Learners with activity</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{analytics.summary.learners}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Sessions</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{analytics.summary.sessions}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Active learners</h3>
        {analytics.active.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            No one is watching right now.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Learner</th>
                  <th className="px-4 py-3">Video</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {analytics.active.map((row) => (
                  <tr key={row.userId} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.name || "Learner"}</div>
                      <div className="text-xs text-gray-500">{row.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.videoTitle}</td>
                    <td className="px-4 py-3 text-gray-600">{row.subject}</td>
                    <td className="px-4 py-3 text-gray-600">{row.courseName}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(row.lastSeenAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">By subject</h3>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Learners</th>
                <th className="px-4 py-3">Watch time</th>
              </tr>
            </thead>
            <tbody>
              {analytics.bySubject.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    No subject data yet.
                  </td>
                </tr>
              ) : (
                analytics.bySubject.map((row) => (
                  <tr key={row.subject} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.subject}</td>
                    <td className="px-4 py-3 text-gray-600">{row.learnerCount}</td>
                    <td className="px-4 py-3 text-gray-600">{row.watchLabel}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">By learner</h3>
          <Link href="/admin/users" className="text-sm text-brand-600 hover:underline">
            Manage users
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Learner</th>
                <th className="px-4 py-3">Videos</th>
                <th className="px-4 py-3">Watch time</th>
                <th className="px-4 py-3">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {analytics.byLearner.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No learner activity yet.
                  </td>
                </tr>
              ) : (
                analytics.byLearner.map((row) => (
                  <tr key={row.userId} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.name || "Learner"}</div>
                      <div className="text-xs text-gray-500">{row.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.videoCount}</td>
                    <td className="px-4 py-3 text-gray-600">{row.watchLabel}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(row.lastSeenAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Recent views (all learners)</h3>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Learner</th>
                <th className="px-4 py-3">Video</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {analytics.recent.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.userName || "Learner"}</div>
                    <div className="text-xs text-gray-500">{row.userEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.videoTitle}</td>
                  <td className="px-4 py-3 text-gray-600">{row.subject}</td>
                  <td className="px-4 py-3 text-gray-600">{row.courseName}</td>
                  <td className="px-4 py-3 text-gray-600">{row.watchLabel}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(row.lastSeenAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
