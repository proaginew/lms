import { listOneDriveCourses, listOneDriveFolderChildren } from "@/lib/graph";
import { generateVideoNotes } from "@/lib/videoNotes";
import { generateVideoQuiz } from "@/lib/videoQuiz";
import { enrichVideoTitle } from "@/lib/videoTitles";
import { prisma } from "@/lib/prisma";

const LOCK_MS = 20 * 60 * 1000;

async function reclaimStuckLocks() {
  const cutoff = new Date(Date.now() - LOCK_MS);
  await prisma.videoAsset.updateMany({
    where: {
      processingLockedAt: { lt: cutoff },
    },
    data: { processingLockedAt: null },
  });
}

export async function discoverOneDriveVideos() {
  const listed = await listOneDriveCourses();
  let enqueued = 0;

  for (const course of listed.courses) {
    const children = await listOneDriveFolderChildren(course.id).catch(() => []);
    const videos = children.filter((c) => c.isVideo);
    for (const video of videos) {
      const existing = await prisma.videoAsset.findUnique({
        where: { itemId: video.id },
      });
      if (!existing) {
        await prisma.videoAsset.create({
          data: {
            itemId: video.id,
            courseFolderId: course.id,
            fileName: video.name,
            status: "PENDING",
            notesStatus: "PENDING",
            quizStatus: "NONE",
          },
        });
        enqueued += 1;
      } else if (
        existing.notesStatus === "NONE" &&
        (existing.transcriptFull || existing.transcriptPreview || existing.status === "READY")
      ) {
        await prisma.videoAsset.update({
          where: { itemId: video.id },
          data: { notesStatus: "PENDING" },
        });
        enqueued += 1;
      }
    }
  }

  await prisma.syncState.upsert({
    where: { id: "drive" },
    create: { id: "drive", lastDiscoverAt: new Date() },
    update: { lastDiscoverAt: new Date() },
  });

  return { courses: listed.courses.length, enqueued };
}

/** Webhooks are healthy only if subscribed and we saw a ping recently (or just created). */
export async function getIngestMode() {
  const state = await prisma.syncState.findUnique({ where: { id: "drive" } });
  const now = Date.now();
  const hasSubscription = Boolean(state?.graphSubscriptionId);
  const expiresAt = state?.subscriptionExpiresAt?.getTime() ?? 0;
  const subscriptionValid = hasSubscription && expiresAt > now + 60_000;
  const lastWebhookAt = state?.lastWebhookAt?.getTime() ?? 0;
  const webhookFresh = lastWebhookAt > 0 && now - lastWebhookAt < 6 * 60 * 60 * 1000;

  if (subscriptionValid && webhookFresh) {
    return {
      mode: "webhook" as const,
      reason: "Graph webhook active and recently received",
      pollRequired: false,
      state,
    };
  }

  if (subscriptionValid && !webhookFresh) {
    return {
      mode: "cron-poller" as const,
      reason: "Webhook subscribed but no recent notifications — using cron poller",
      pollRequired: true,
      state,
    };
  }

  return {
    mode: "cron-poller" as const,
    reason: hasSubscription
      ? "Webhook subscription expired or missing renew — using cron poller"
      : "No Graph webhook — using cron poller to scan OneDrive",
    pollRequired: true,
    state,
  };
}

async function claimNextJob() {
  await reclaimStuckLocks();
  const now = new Date();

  const notesJob = await prisma.videoAsset.findFirst({
    where: {
      notesStatus: { in: ["PENDING", "NONE"] },
      processingLockedAt: null,
    },
    orderBy: { updatedAt: "asc" },
  });
  if (notesJob) {
    const locked = await prisma.videoAsset.updateMany({
      where: { id: notesJob.id, processingLockedAt: null },
      data: { processingLockedAt: now, notesStatus: "PENDING" },
    });
    if (locked.count) return { kind: "notes" as const, item: notesJob };
  }

  const quizJob = await prisma.videoAsset.findFirst({
    where: {
      notesStatus: "READY",
      quizStatus: { in: ["PENDING", "NONE"] },
      processingLockedAt: null,
    },
    orderBy: { updatedAt: "asc" },
  });
  if (quizJob) {
    const locked = await prisma.videoAsset.updateMany({
      where: { id: quizJob.id, processingLockedAt: null },
      data: { processingLockedAt: now, quizStatus: "PENDING" },
    });
    if (locked.count) return { kind: "quiz" as const, item: quizJob };
  }

  return null;
}

export async function processContentAgentTick(input?: {
  discover?: boolean;
  /** When true, always poll OneDrive even if webhooks look healthy. Cron should pass this. */
  forcePoll?: boolean;
}) {
  const ingest = await getIngestMode();
  const shouldDiscover =
    input?.forcePoll === true ||
    input?.discover === true ||
    ingest.pollRequired ||
    input?.discover !== false;

  const discover = shouldDiscover
    ? await discoverOneDriveVideos().catch((error) => ({
        error: error instanceof Error ? error.message : "discover failed",
        enqueued: 0,
        courses: 0,
      }))
    : null;

  const job = await claimNextJob();
  if (!job) {
    return {
      ingest: { mode: ingest.mode, reason: ingest.reason },
      discover,
      processed: null as null,
    };
  }

  try {
    if (job.kind === "notes") {
      if (job.item.status !== "READY" || !job.item.transcriptFull) {
        await enrichVideoTitle({
          itemId: job.item.itemId,
          courseFolderId: job.item.courseFolderId,
          fileName: job.item.fileName,
          force: !job.item.transcriptFull,
        });
      }
      const row = await generateVideoNotes({
        itemId: job.item.itemId,
        courseFolderId: job.item.courseFolderId,
      });
      await prisma.videoAsset.update({
        where: { itemId: job.item.itemId },
        data: { processingLockedAt: null },
      });
      return {
        ingest: { mode: ingest.mode, reason: ingest.reason },
        discover,
        processed: {
          kind: "notes",
          itemId: job.item.itemId,
          notesStatus: row.notesStatus,
          quizStatus: row.quizStatus,
        },
      };
    }

    const row = await generateVideoQuiz({ itemId: job.item.itemId });
    await prisma.videoAsset.update({
      where: { itemId: job.item.itemId },
      data: { processingLockedAt: null },
    });
    return {
      ingest: { mode: ingest.mode, reason: ingest.reason },
      discover,
      processed: {
        kind: "quiz",
        itemId: job.item.itemId,
        notesStatus: row.notesStatus,
        quizStatus: row.quizStatus,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent tick failed";
    await prisma.videoAsset.update({
      where: { itemId: job.item.itemId },
      data: {
        processingLockedAt: null,
        ...(job.kind === "notes"
          ? { notesStatus: "FAILED", notesError: message.slice(0, 500) }
          : { quizStatus: "FAILED", quizError: message.slice(0, 500) }),
      },
    });
    return {
      ingest: { mode: ingest.mode, reason: ingest.reason },
      discover,
      processed: { kind: job.kind, itemId: job.item.itemId, error: message },
    };
  }
}

export async function getContentQueueStats() {
  const [notesNone, notesPending, notesReady, notesFailed, quizNone, quizPending, quizReady, quizFailed] =
    await Promise.all([
      prisma.videoAsset.count({ where: { notesStatus: "NONE" } }),
      prisma.videoAsset.count({ where: { notesStatus: "PENDING" } }),
      prisma.videoAsset.count({ where: { notesStatus: "READY" } }),
      prisma.videoAsset.count({ where: { notesStatus: "FAILED" } }),
      prisma.videoAsset.count({ where: { quizStatus: "NONE" } }),
      prisma.videoAsset.count({ where: { quizStatus: "PENDING" } }),
      prisma.videoAsset.count({ where: { quizStatus: "READY" } }),
      prisma.videoAsset.count({ where: { quizStatus: "FAILED" } }),
    ]);
  return {
    notes: { NONE: notesNone, PENDING: notesPending, READY: notesReady, FAILED: notesFailed },
    quiz: { NONE: quizNone, PENDING: quizPending, READY: quizReady, FAILED: quizFailed },
  };
}

export function assertCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

export function getAppBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}
