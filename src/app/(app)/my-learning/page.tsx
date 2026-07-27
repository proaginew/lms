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
        <h2 className="text-xl font-semibold sm:text-2xl">My Learning</h2>
        <p className="yt-meta mt-1">Your viewing analytics by subject and course.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="yt-card p-5">
          <p className="yt-meta">Watch time</p>
          <p className="mt-2 text-3xl font-semibold">{analytics.summary.totalWatchLabel}</p>
        </div>
        <div className="yt-card p-5">
          <p className="yt-meta">Videos started</p>
          <p className="mt-2 text-3xl font-semibold">{analytics.summary.uniqueVideos}</p>
        </div>
        <div className="yt-card p-5">
          <p className="yt-meta">Courses</p>
          <p className="mt-2 text-3xl font-semibold">{analytics.summary.uniqueCourses}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">By subject</h3>
        {analytics.bySubject.length === 0 ? (
          <p className="yt-meta">No viewing activity yet. Open a course video to start.</p>
        ) : (
          <div className="yt-card overflow-hidden">
            <table className="yt-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Videos</th>
                  <th>Watch time</th>
                  <th>Last watched</th>
                </tr>
              </thead>
              <tbody>
                {analytics.bySubject.map((row) => (
                  <tr key={row.subject}>
                    <td className="font-medium">{row.subject}</td>
                    <td>{row.videoCount}</td>
                    <td>{row.watchLabel}</td>
                    <td className="text-[var(--yt-muted)]">
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
        <h3 className="text-lg font-semibold">By course</h3>
        {analytics.byCourse.length === 0 ? (
          <p className="yt-meta">No courses watched yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {analytics.byCourse.map((row) => (
              <Link
                key={row.courseFolderId}
                href={`/courses/${encodeURIComponent(row.courseFolderId)}`}
                className="yt-card p-4 hover:bg-[#f2f2f2]"
              >
                <p className="font-medium">{row.courseName}</p>
                <p className="yt-meta mt-1">
                  {row.videoCount} videos · {row.watchLabel}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Recent activity</h3>
        {analytics.recent.length === 0 ? (
          <p className="yt-meta">Nothing here yet.</p>
        ) : (
          <div className="yt-card overflow-hidden">
            <table className="yt-table">
              <thead>
                <tr>
                  <th>Video</th>
                  <th>Subject</th>
                  <th>Course</th>
                  <th>Time</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recent.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.videoTitle}</td>
                    <td>{row.subject}</td>
                    <td>{row.courseName}</td>
                    <td>{row.watchLabel}</td>
                    <td className="text-[var(--yt-muted)]">
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
