import { requireAppUser } from "@/lib/auth";
import { getLearnerAnalytics } from "@/lib/analytics";
import { getOrCreateGamification } from "@/lib/gamification";
import { accentClass } from "@/lib/tileAccent";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MyLearningPage() {
  const user = await requireAppUser();
  const [analytics, gamification] = await Promise.all([
    getLearnerAnalytics(user.id),
    getOrCreateGamification(user.id),
  ]);

  const badges = (() => {
    try {
      const parsed = JSON.parse(gamification.badgesJson) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [] as string[];
    }
  })();

  const xpIntoLevel = gamification.totalXp % 100;
  const stats = [
    { label: "Watch time", value: analytics.summary.totalWatchLabel, seed: "watch" },
    { label: "Videos started", value: String(analytics.summary.uniqueVideos), seed: "videos" },
    { label: "Courses", value: String(analytics.summary.uniqueCourses), seed: "courses" },
    { label: "Level", value: String(gamification.level), seed: "level" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">My Learning</h2>
        <p className="yt-meta mt-1">Your progress, XP, and viewing analytics.</p>
      </div>

      <div className="xp-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="yt-meta">Gamification</p>
            <p className="mt-1 text-2xl font-semibold">
              Level {gamification.level} · {gamification.totalXp} XP
            </p>
            <p className="mt-1 text-sm text-[var(--yt-muted)]">
              Streak {gamification.currentStreak} day
              {gamification.currentStreak === 1 ? "" : "s"} · Best{" "}
              {gamification.longestStreak}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {badges.length === 0 ? (
              <span className="yt-badge yt-badge-accent">Take a quiz to earn badges</span>
            ) : (
              badges.map((badge) => (
                <span key={badge} className="yt-badge yt-badge-approved">
                  {badge.replaceAll("_", " ")}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="xp-bar" aria-hidden>
          <span style={{ width: `${xpIntoLevel}%` }} />
        </div>
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
        <h3 className="text-lg font-semibold">By subject</h3>
        {analytics.bySubject.length === 0 ? (
          <p className="yt-meta">No viewing activity yet. Open a course video to start.</p>
        ) : (
          <div className="yt-grid">
            {analytics.bySubject.map((row) => (
              <div key={row.subject} className={`yt-tile ${accentClass(row.subject)}`}>
                <div className="yt-tile-body space-y-2 !pt-4">
                  <span className="yt-badge yt-badge-accent">{row.subject}</span>
                  <p className="text-lg font-semibold">{row.watchLabel}</p>
                  <p className="yt-meta">
                    {row.videoCount} videos · {new Date(row.lastSeenAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">By course</h3>
        {analytics.byCourse.length === 0 ? (
          <p className="yt-meta">No courses watched yet.</p>
        ) : (
          <div className="yt-grid">
            {analytics.byCourse.map((row) => (
              <Link
                key={row.courseFolderId}
                href={`/courses/${encodeURIComponent(row.courseFolderId)}`}
                className={`yt-tile ${accentClass(row.courseFolderId)}`}
              >
                <div className="yt-tile-body space-y-1.5 !pt-4">
                  <h3 className="yt-title">{row.courseName}</h3>
                  <p className="yt-meta">
                    {row.videoCount} videos · {row.watchLabel}
                  </p>
                </div>
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
          <div className="yt-card yt-table-scroll">
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
