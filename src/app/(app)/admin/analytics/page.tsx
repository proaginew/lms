import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { getAdminAnalytics } from "@/lib/analytics";
import { accentClass } from "@/lib/tileAccent";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN") redirect("/");

  const analytics = await getAdminAnalytics();

  const stats = [
    { label: "Active now", value: analytics.summary.activeNow, seed: "active" },
    { label: "Total watch time", value: analytics.summary.totalWatchLabel, seed: "watch" },
    { label: "Learners with activity", value: analytics.summary.learners, seed: "learners" },
    { label: "Sessions", value: analytics.summary.sessions, seed: "sessions" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Analytics</h2>
        <p className="yt-meta mt-1">Active learners and viewing analytics across all subjects.</p>
      </div>

      <div className="yt-grid-stats yt-grid-stats-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`yt-stat-card ${accentClass(stat.seed)}`}>
            <p className="yt-meta">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold sm:text-3xl">{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Active learners</h3>
        {analytics.active.length === 0 ? (
          <p className="yt-card p-6 yt-meta">No one is watching right now.</p>
        ) : (
          <div className="yt-card yt-table-scroll">
            <table className="yt-table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Video</th>
                  <th>Subject</th>
                  <th>Course</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {analytics.active.map((row) => (
                  <tr key={row.userId}>
                    <td>
                      <div className="font-medium">{row.name || "Learner"}</div>
                      <div className="text-xs text-[var(--yt-muted)]">{row.email}</div>
                    </td>
                    <td>{row.videoTitle}</td>
                    <td>{row.subject}</td>
                    <td>{row.courseName}</td>
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
        <h3 className="text-lg font-semibold">By subject</h3>
        {analytics.bySubject.length === 0 ? (
          <p className="yt-card p-6 yt-meta">No subject data yet.</p>
        ) : (
          <div className="yt-card yt-table-scroll">
            <table className="yt-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Learners</th>
                  <th>Watch time</th>
                </tr>
              </thead>
              <tbody>
                {analytics.bySubject.map((row) => (
                  <tr key={row.subject}>
                    <td className="font-medium">{row.subject}</td>
                    <td>{row.learnerCount}</td>
                    <td>{row.watchLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">By learner</h3>
          <Link href="/admin/users" className="text-sm text-[var(--yt-muted)] hover:underline">
            Manage users
          </Link>
        </div>
        <div className="yt-card yt-table-scroll">
          <table className="yt-table">
            <thead>
              <tr>
                <th>Learner</th>
                <th>Videos</th>
                <th>Watch time</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {analytics.byLearner.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--yt-muted)]">
                    No learner activity yet.
                  </td>
                </tr>
              ) : (
                analytics.byLearner.map((row) => (
                  <tr key={row.userId}>
                    <td>
                      <div className="font-medium">{row.name || "Learner"}</div>
                      <div className="text-xs text-[var(--yt-muted)]">{row.email}</div>
                    </td>
                    <td>{row.videoCount}</td>
                    <td>{row.watchLabel}</td>
                    <td className="text-[var(--yt-muted)]">
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
        <h3 className="text-lg font-semibold">Recent views (all learners)</h3>
        <div className="yt-card yt-table-scroll">
          <table className="yt-table">
            <thead>
              <tr>
                <th>Learner</th>
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
                  <td>
                    <div className="font-medium">{row.userName || "Learner"}</div>
                    <div className="text-xs text-[var(--yt-muted)]">{row.userEmail}</div>
                  </td>
                  <td>{row.videoTitle}</td>
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
      </section>
    </div>
  );
}
