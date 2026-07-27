import { prisma } from "@/lib/prisma";

const ACTIVE_MS = 60_000;
const HEARTBEAT_SECONDS = 15;

export async function startWatchEvent(input: {
  userId: string;
  courseFolderId: string;
  courseName: string;
  itemId: string;
  videoTitle: string;
  subject: string;
}) {
  // Close any open events for this user (single active view).
  await prisma.watchEvent.updateMany({
    where: { userId: input.userId, endedAt: null },
    data: { endedAt: new Date() },
  });

  return prisma.watchEvent.create({
    data: {
      userId: input.userId,
      courseFolderId: input.courseFolderId,
      courseName: input.courseName,
      itemId: input.itemId,
      videoTitle: input.videoTitle,
      subject: input.subject.trim() || "General",
      secondsWatched: 0,
      startedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
}

export async function heartbeatWatchEvent(userId: string, itemId: string) {
  const open = await prisma.watchEvent.findFirst({
    where: { userId, itemId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!open) return null;

  return prisma.watchEvent.update({
    where: { id: open.id },
    data: {
      lastSeenAt: new Date(),
      secondsWatched: { increment: HEARTBEAT_SECONDS },
    },
  });
}

export async function endWatchEvents(userId: string, itemId?: string) {
  await prisma.watchEvent.updateMany({
    where: {
      userId,
      endedAt: null,
      ...(itemId ? { itemId } : {}),
    },
    data: { endedAt: new Date(), lastSeenAt: new Date() },
  });
}

export async function getActiveLearners() {
  const since = new Date(Date.now() - ACTIVE_MS);
  const [sessions, events] = await Promise.all([
    prisma.playbackSession.findMany({
      where: { expiresAt: { gt: new Date() } },
      include: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.watchEvent.findMany({
      where: { endedAt: null, lastSeenAt: { gte: since } },
      include: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
      },
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);

  const byUser = new Map<
    string,
    {
      userId: string;
      name: string | null;
      email: string | null;
      imageUrl: string | null;
      courseFolderId: string;
      courseName: string;
      itemId: string;
      videoTitle: string;
      subject: string;
      lastSeenAt: string;
    }
  >();

  for (const event of events) {
    byUser.set(event.userId, {
      userId: event.userId,
      name: event.user.name,
      email: event.user.email,
      imageUrl: event.user.imageUrl,
      courseFolderId: event.courseFolderId,
      courseName: event.courseName,
      itemId: event.itemId,
      videoTitle: event.videoTitle,
      subject: event.subject,
      lastSeenAt: event.lastSeenAt.toISOString(),
    });
  }

  for (const session of sessions) {
    if (byUser.has(session.userId)) continue;
    byUser.set(session.userId, {
      userId: session.userId,
      name: session.user.name,
      email: session.user.email,
      imageUrl: session.user.imageUrl,
      courseFolderId: session.courseFolderId,
      courseName: "Course",
      itemId: session.itemId,
      videoTitle: "Watching…",
      subject: "General",
      lastSeenAt: session.updatedAt.toISOString(),
    });
  }

  return Array.from(byUser.values());
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export async function getLearnerAnalytics(userId: string) {
  const events = await prisma.watchEvent.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  });

  const totalSeconds = events.reduce((sum, e) => sum + e.secondsWatched, 0);
  const uniqueVideos = new Set(events.map((e) => e.itemId)).size;
  const uniqueCourses = new Set(events.map((e) => e.courseFolderId)).size;

  const bySubjectMap = new Map<
    string,
    { subject: string; seconds: number; videos: Set<string>; lastSeenAt: Date }
  >();
  const byCourseMap = new Map<
    string,
    {
      courseFolderId: string;
      courseName: string;
      seconds: number;
      videos: Set<string>;
      lastSeenAt: Date;
    }
  >();

  for (const event of events) {
    const subject = event.subject || "General";
    const sub = bySubjectMap.get(subject) ?? {
      subject,
      seconds: 0,
      videos: new Set<string>(),
      lastSeenAt: event.lastSeenAt,
    };
    sub.seconds += event.secondsWatched;
    sub.videos.add(event.itemId);
    if (event.lastSeenAt > sub.lastSeenAt) sub.lastSeenAt = event.lastSeenAt;
    bySubjectMap.set(subject, sub);

    const course = byCourseMap.get(event.courseFolderId) ?? {
      courseFolderId: event.courseFolderId,
      courseName: event.courseName,
      seconds: 0,
      videos: new Set<string>(),
      lastSeenAt: event.lastSeenAt,
    };
    course.seconds += event.secondsWatched;
    course.videos.add(event.itemId);
    if (event.lastSeenAt > course.lastSeenAt) course.lastSeenAt = event.lastSeenAt;
    byCourseMap.set(event.courseFolderId, course);
  }

  return {
    summary: {
      totalSeconds,
      totalWatchLabel: formatDuration(totalSeconds),
      uniqueVideos,
      uniqueCourses,
      sessions: events.length,
    },
    bySubject: Array.from(bySubjectMap.values())
      .map((row) => ({
        subject: row.subject,
        seconds: row.seconds,
        watchLabel: formatDuration(row.seconds),
        videoCount: row.videos.size,
        lastSeenAt: row.lastSeenAt.toISOString(),
      }))
      .sort((a, b) => b.seconds - a.seconds),
    byCourse: Array.from(byCourseMap.values())
      .map((row) => ({
        courseFolderId: row.courseFolderId,
        courseName: row.courseName,
        seconds: row.seconds,
        watchLabel: formatDuration(row.seconds),
        videoCount: row.videos.size,
        lastSeenAt: row.lastSeenAt.toISOString(),
      }))
      .sort((a, b) => b.seconds - a.seconds),
    recent: events.slice(0, 40).map((event) => ({
      id: event.id,
      courseFolderId: event.courseFolderId,
      courseName: event.courseName,
      itemId: event.itemId,
      videoTitle: event.videoTitle,
      subject: event.subject,
      secondsWatched: event.secondsWatched,
      watchLabel: formatDuration(event.secondsWatched),
      startedAt: event.startedAt.toISOString(),
      lastSeenAt: event.lastSeenAt.toISOString(),
      endedAt: event.endedAt?.toISOString() ?? null,
    })),
  };
}

export async function getQuizAdminAnalytics() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [attempts, recent, byVideoRaw, gamers] = await Promise.all([
    prisma.quizAttempt.findMany({
      select: {
        id: true,
        userId: true,
        itemId: true,
        percent: true,
        score: true,
        maxScore: true,
        xpAwarded: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.quizAttempt.findMany({
      take: 25,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.quizAttempt.groupBy({
      by: ["itemId"],
      _count: { _all: true },
      _avg: { percent: true },
      orderBy: { _count: { itemId: "desc" } },
      take: 8,
    }),
    prisma.userGamification.findMany({
      take: 8,
      orderBy: { totalXp: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const videoIds = Array.from(
    new Set([
      ...recent.map((a) => a.itemId),
      ...byVideoRaw.map((row) => row.itemId),
    ]),
  );
  const videos = videoIds.length
    ? await prisma.videoAsset.findMany({
        where: { itemId: { in: videoIds } },
        select: { itemId: true, title: true, fileName: true, courseFolderId: true },
      })
    : [];
  const videoTitle = new Map(
    videos.map((v) => [v.itemId, v.title || v.fileName || "Lecture"]),
  );

  const learners = new Set(attempts.map((a) => a.userId)).size;
  const avgPercent = attempts.length
    ? Math.round(
        attempts.reduce((sum, a) => sum + a.percent, 0) / attempts.length,
      )
    : 0;
  const passRate = attempts.length
    ? Math.round(
        (attempts.filter((a) => a.percent >= 70).length / attempts.length) * 100,
      )
    : 0;
  const attemptsThisWeek = attempts.filter((a) => a.createdAt >= weekAgo).length;
  const perfectCount = attempts.filter((a) => a.percent === 100).length;

  const byLearnerMap = new Map<
    string,
    {
      userId: string;
      name: string | null;
      email: string | null;
      attempts: number;
      bestPercent: number;
      avgPercent: number;
      totalXp: number;
      lastAt: Date;
      percents: number[];
    }
  >();

  for (const attempt of attempts) {
    const existing = byLearnerMap.get(attempt.userId);
    if (!existing) {
      byLearnerMap.set(attempt.userId, {
        userId: attempt.userId,
        name: null,
        email: null,
        attempts: 1,
        bestPercent: attempt.percent,
        avgPercent: attempt.percent,
        totalXp: attempt.xpAwarded,
        lastAt: attempt.createdAt,
        percents: [attempt.percent],
      });
      continue;
    }
    existing.attempts += 1;
    existing.bestPercent = Math.max(existing.bestPercent, attempt.percent);
    existing.totalXp += attempt.xpAwarded;
    existing.percents.push(attempt.percent);
    if (attempt.createdAt > existing.lastAt) existing.lastAt = attempt.createdAt;
  }

  const recentUserMeta = new Map(
    recent.map((a) => [a.userId, { name: a.user.name, email: a.user.email }]),
  );
  for (const [userId, meta] of recentUserMeta) {
    const row = byLearnerMap.get(userId);
    if (row) {
      row.name = meta.name;
      row.email = meta.email;
    }
  }

  // Fill missing learner names for top performers
  const missingIds = Array.from(byLearnerMap.values())
    .filter((r) => !r.name && !r.email)
    .map((r) => r.userId);
  if (missingIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: missingIds } },
      select: { id: true, name: true, email: true },
    });
    for (const u of users) {
      const row = byLearnerMap.get(u.id);
      if (row) {
        row.name = u.name;
        row.email = u.email;
      }
    }
  }

  const byLearner = Array.from(byLearnerMap.values())
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      attempts: row.attempts,
      bestPercent: row.bestPercent,
      avgPercent: Math.round(
        row.percents.reduce((s, p) => s + p, 0) / row.percents.length,
      ),
      totalXp: row.totalXp,
      lastAt: row.lastAt.toISOString(),
    }))
    .sort((a, b) => b.attempts - a.attempts || b.avgPercent - a.avgPercent)
    .slice(0, 12);

  return {
    summary: {
      totalAttempts: attempts.length,
      learners,
      avgPercent,
      passRate,
      attemptsThisWeek,
      perfectCount,
    },
    recent: recent.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: a.user.name,
      userEmail: a.user.email,
      itemId: a.itemId,
      videoTitle: videoTitle.get(a.itemId) || "Lecture",
      score: a.score,
      maxScore: a.maxScore,
      percent: a.percent,
      xpAwarded: a.xpAwarded,
      createdAt: a.createdAt.toISOString(),
    })),
    byVideo: byVideoRaw.map((row) => ({
      itemId: row.itemId,
      videoTitle: videoTitle.get(row.itemId) || "Lecture",
      attempts: row._count._all,
      avgPercent: Math.round(row._avg.percent || 0),
    })),
    byLearner,
    leaderboard: gamers.map((g) => ({
      userId: g.userId,
      name: g.user.name,
      email: g.user.email,
      totalXp: g.totalXp,
      level: g.level,
      currentStreak: g.currentStreak,
    })),
  };
}

export async function getAdminAnalytics() {
  const events = await prisma.watchEvent.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  const totalSeconds = events.reduce((sum, e) => sum + e.secondsWatched, 0);
  const learners = new Set(events.map((e) => e.userId)).size;

  const bySubjectMap = new Map<string, { subject: string; seconds: number; learners: Set<string> }>();
  const byLearnerMap = new Map<
    string,
    {
      userId: string;
      name: string | null;
      email: string | null;
      seconds: number;
      videos: Set<string>;
      lastSeenAt: Date;
    }
  >();

  for (const event of events) {
    const subject = event.subject || "General";
    const sub = bySubjectMap.get(subject) ?? {
      subject,
      seconds: 0,
      learners: new Set<string>(),
    };
    sub.seconds += event.secondsWatched;
    sub.learners.add(event.userId);
    bySubjectMap.set(subject, sub);

    const learner = byLearnerMap.get(event.userId) ?? {
      userId: event.userId,
      name: event.user.name,
      email: event.user.email,
      seconds: 0,
      videos: new Set<string>(),
      lastSeenAt: event.lastSeenAt,
    };
    learner.seconds += event.secondsWatched;
    learner.videos.add(event.itemId);
    if (event.lastSeenAt > learner.lastSeenAt) learner.lastSeenAt = event.lastSeenAt;
    byLearnerMap.set(event.userId, learner);
  }

  const active = await getActiveLearners();

  return {
    summary: {
      totalSeconds,
      totalWatchLabel: formatDuration(totalSeconds),
      learners,
      sessions: events.length,
      activeNow: active.length,
    },
    active,
    bySubject: Array.from(bySubjectMap.values())
      .map((row) => ({
        subject: row.subject,
        seconds: row.seconds,
        watchLabel: formatDuration(row.seconds),
        learnerCount: row.learners.size,
      }))
      .sort((a, b) => b.seconds - a.seconds),
    byLearner: Array.from(byLearnerMap.values())
      .map((row) => ({
        userId: row.userId,
        name: row.name,
        email: row.email,
        seconds: row.seconds,
        watchLabel: formatDuration(row.seconds),
        videoCount: row.videos.size,
        lastSeenAt: row.lastSeenAt.toISOString(),
      }))
      .sort((a, b) => b.seconds - a.seconds),
    recent: events.slice(0, 60).map((event) => ({
      id: event.id,
      userId: event.userId,
      userName: event.user.name,
      userEmail: event.user.email,
      courseName: event.courseName,
      videoTitle: event.videoTitle,
      subject: event.subject,
      watchLabel: formatDuration(event.secondsWatched),
      lastSeenAt: event.lastSeenAt.toISOString(),
    })),
  };
}
