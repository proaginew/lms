import {
  assertCronSecret,
  getAppBaseUrl,
  getIngestMode,
  processContentAgentTick,
} from "@/lib/contentAgent";
import {
  ensureDriveWebhookSubscription,
  renewDriveWebhookSubscription,
} from "@/lib/graph";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

async function authorize(request: Request) {
  if (assertCronSecret(request)) return { mode: "cron" as const };
  try {
    await requireAdmin();
    return { mode: "admin" as const };
  } catch {
    return null;
  }
}

/**
 * Cron poller is the reliable path:
 * - Always scans OneDrive for new videos
 * - Processes one queued notes/quiz job
 * - Tries webhook renew/ensure only as best-effort (never blocks polling)
 */
export async function POST(request: Request) {
  const authz = await authorize(request);
  if (!authz) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    discover?: boolean;
    forcePoll?: boolean;
    renewSubscription?: boolean;
    ensureSubscription?: boolean;
  };

  const isCron = authz.mode === "cron";
  const subscriptionErrors: string[] = [];

  // Best-effort webhook maintenance — failures must not stop cron polling
  if (body.ensureSubscription || body.renewSubscription || isCron) {
    const base = getAppBaseUrl();
    const notificationUrl = `${base}/api/webhooks/graph`;
    const state = await prisma.syncState.upsert({
      where: { id: "drive" },
      create: { id: "drive" },
      update: {},
    });

    try {
      const needsRenew =
        body.renewSubscription ||
        (isCron &&
          state.graphSubscriptionId &&
          (!state.subscriptionExpiresAt ||
            state.subscriptionExpiresAt.getTime() < Date.now() + 12 * 60 * 60 * 1000));

      if (needsRenew && state.graphSubscriptionId) {
        const renewed = await renewDriveWebhookSubscription(state.graphSubscriptionId);
        await prisma.syncState.update({
          where: { id: "drive" },
          data: {
            graphSubscriptionId: renewed.id,
            subscriptionExpiresAt: renewed.expirationDateTime,
          },
        });
      } else if (body.ensureSubscription || (isCron && !state.graphSubscriptionId)) {
        // Only auto-create on explicit ensure, or cron when missing and app URL is public HTTPS
        if (body.ensureSubscription || notificationUrl.startsWith("https://")) {
          const created = await ensureDriveWebhookSubscription(notificationUrl);
          await prisma.syncState.update({
            where: { id: "drive" },
            data: {
              graphSubscriptionId: created.id,
              subscriptionExpiresAt: created.expirationDateTime,
            },
          });
        }
      }
    } catch (error) {
      subscriptionErrors.push(
        error instanceof Error ? error.message : "Subscription management failed",
      );
    }
  }

  // Always force OneDrive poll on cron ticks so missing webhooks never stall the queue
  const result = await processContentAgentTick({
    discover: body.discover !== false,
    forcePoll: isCron || body.forcePoll === true || body.discover !== false,
  });

  const ingest = await getIngestMode();

  return NextResponse.json({
    ok: true,
    fallback: ingest.mode === "cron-poller",
    ...result,
    ingest: { mode: ingest.mode, reason: ingest.reason },
    subscriptionErrors: subscriptionErrors.length ? subscriptionErrors : undefined,
  });
}

export async function GET(request: Request) {
  // Vercel Cron invokes GET — always poll + process
  return POST(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ discover: true, forcePoll: true }),
    }),
  );
}
