import { requireAppUser } from "@/lib/auth";
import { getLearnerAnalytics } from "@/lib/analytics";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MyLearningPage() {
  const user = await requireAppUser();
  const analytics = await getLearnerAnalytics(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">My Learning</h2>
        <p className="mt-1 text-sm text-gray-500">
          Your viewing analytics by subject and course.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Watch time</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {analytics.summary.totalWatchLabel}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Videos started</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {analytics.summary.uniqueVideos}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Courses</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {analytics.summary.uniqueCourses}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">By subject</h3>
        {analytics.bySubject.length === 0 ? (
          <p className="text-sm text-gray-500">No viewing activity yet. Open a course video to start.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Videos</th>
                  <th className="px-4 py-3">Watch time</th>
                  <th className="px-4 py-3">Last watched</th>
                </tr>
              </thead>
              <tbody>
                {analytics.bySubject.map((row) => (
                  <tr key={row.subject} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.subject}</td>
                    <td className="px-4 py-3 text-gray-600">{row.videoCount}</td>
                    <td className="px-4 py-3 text-gray-600">{row.watchLabel}</td>
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
        <h3 className="text-lg font-semibold text-gray-900">By course</h3>
        {analytics.byCourse.length === 0 ? (
          <p className="text-sm text-gray-500">No courses watched yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {analytics.byCourse.map((row) => (
              <Link
                key={row.courseFolderId}
                href={`/courses/${encodeURIComponent(row.courseFolderId)}`}
                className="rounded-2xl border border-gray-200 bg-white p-4 hover:border-brand-300"
              >
                <p className="font-medium text-gray-900">{row.courseName}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {row.videoCount} videos · {row.watchLabel}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Recent activity</h3>
        {analytics.recent.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing here yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
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
                    <td className="px-4 py-3 font-medium text-gray-900">{row.videoTitle}</td>
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
        )}
      </section>
    </div>
  );
}
