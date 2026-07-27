import { prisma } from "@/lib/prisma";

const XP_BASE = 20;
const XP_PASS = 15;
const XP_PERFECT = 25;
const XP_IMPROVE = 10;
const XP_STREAK = 5;
const XP_PER_LEVEL = 100;

function parseBadges(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
}

function sameUtcDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function yesterdayUtc(d: Date) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() - 1);
  return x;
}

export async function getOrCreateGamification(userId: string) {
  return prisma.userGamification.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function awardQuizXp(input: {
  userId: string;
  itemId: string;
  percent: number;
  previousBestPercent: number | null;
}) {
  const profile = await getOrCreateGamification(input.userId);
  const now = new Date();
  let xp = XP_BASE;
  if (input.percent >= 70) xp += XP_PASS;
  if (input.percent >= 100) xp += XP_PERFECT;
  if (
    input.previousBestPercent != null &&
    input.percent > input.previousBestPercent
  ) {
    xp += XP_IMPROVE;
  }

  let currentStreak = profile.currentStreak;
  const last = profile.lastActivityAt;
  if (!last) {
    currentStreak = 1;
    xp += XP_STREAK;
  } else if (sameUtcDay(last, now)) {
    // same day, keep streak
  } else if (sameUtcDay(last, yesterdayUtc(now))) {
    currentStreak += 1;
    xp += XP_STREAK;
  } else {
    currentStreak = 1;
    xp += XP_STREAK;
  }

  const badges = new Set(parseBadges(profile.badgesJson));
  const attemptCount = await prisma.quizAttempt.count({ where: { userId: input.userId } });
  if (attemptCount === 0) badges.add("first_quiz");
  if (input.percent >= 100) badges.add("perfect_score");
  if (currentStreak >= 3) badges.add("streak_3");
  if (currentStreak >= 7) badges.add("streak_7");
  const distinctVideos = await prisma.quizAttempt.groupBy({
    by: ["itemId"],
    where: { userId: input.userId },
  });
  if (distinctVideos.length + 1 >= 5) badges.add("quiz_master_5");

  const totalXp = profile.totalXp + xp;
  const updated = await prisma.userGamification.update({
    where: { userId: input.userId },
    data: {
      totalXp,
      level: levelFromXp(totalXp),
      currentStreak,
      longestStreak: Math.max(profile.longestStreak, currentStreak),
      lastActivityAt: now,
      badgesJson: JSON.stringify([...badges]),
    },
  });

  return { xpAwarded: xp, profile: updated };
}

export async function getLeaderboard(limit = 10) {
  return prisma.userGamification.findMany({
    orderBy: [{ totalXp: "desc" }, { updatedAt: "asc" }],
    take: limit,
    include: {
      user: { select: { id: true, name: true, email: true, imageUrl: true } },
    },
  });
}
