import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const PLAYBACK_TTL_MS = 45_000;

export function createPlaybackToken(): string {
  return randomBytes(32).toString("hex");
}

export function playbackExpiry(from = new Date()): Date {
  return new Date(from.getTime() + PLAYBACK_TTL_MS);
}

/** One active playback session per user — claiming invalidates all others. */
export async function claimPlaybackSession(input: {
  userId: string;
  courseFolderId: string;
  itemId: string;
  tabId: string;
}) {
  const token = createPlaybackToken();
  const expiresAt = playbackExpiry();

  await prisma.$transaction([
    prisma.playbackSession.deleteMany({ where: { userId: input.userId } }),
    prisma.playbackSession.create({
      data: {
        token,
        userId: input.userId,
        courseFolderId: input.courseFolderId,
        itemId: input.itemId,
        tabId: input.tabId,
        expiresAt,
      },
    }),
  ]);

  return { token, expiresAt, tabId: input.tabId };
}

export async function heartbeatPlaybackSession(input: {
  userId: string;
  token: string;
  tabId: string;
}) {
  const session = await prisma.playbackSession.findUnique({
    where: { token: input.token },
  });
  if (
    !session ||
    session.userId !== input.userId ||
    session.tabId !== input.tabId ||
    session.expiresAt.getTime() < Date.now()
  ) {
    return null;
  }

  return prisma.playbackSession.update({
    where: { id: session.id },
    data: { expiresAt: playbackExpiry() },
  });
}

export async function validatePlaybackSession(input: {
  userId: string;
  token: string;
  itemId: string;
  courseFolderId: string;
}) {
  const session = await prisma.playbackSession.findUnique({
    where: { token: input.token },
  });
  if (!session) return null;
  if (session.userId !== input.userId) return null;
  if (session.itemId !== input.itemId) return null;
  if (session.courseFolderId !== input.courseFolderId) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  return session;
}

export async function endPlaybackSession(userId: string, token?: string) {
  if (token) {
    await prisma.playbackSession.deleteMany({ where: { userId, token } });
    return;
  }
  await prisma.playbackSession.deleteMany({ where: { userId } });
}
