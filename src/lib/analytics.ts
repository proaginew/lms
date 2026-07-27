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
