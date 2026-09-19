import ContentAgentAdmin from "@/components/ContentAgentAdmin";
import { getContentQueueStats, getIngestMode } from "@/lib/contentAgent";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminNotesPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const [stats, rows, ingest] = await Promise.all([
    getContentQueueStats(),
    prisma.videoAsset.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        itemId: true,
        title: true,
        fileName: true,
        courseFolderId: true,
        notesStatus: true,
        quizStatus: true,
        notesError: true,
        quizError: true,
        updatedAt: true,
      },
    }),
    getIngestMode(),
  ]);

  const sync = ingest.state;

  return (
    <ContentAgentAdmin
      initialStats={stats}
      total={rows.length}
      initialRows={rows.map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      }))}
      openaiConfigured={Boolean(process.env.OPENAI_API_KEY?.trim())}
      sync={{
        graphSubscriptionId: sync?.graphSubscriptionId ?? null,
        subscriptionExpiresAt: sync?.subscriptionExpiresAt?.toISOString() ?? null,
        lastWebhookAt: sync?.lastWebhookAt?.toISOString() ?? null,
        lastDiscoverAt: sync?.lastDiscoverAt?.toISOString() ?? null,
        ingestMode: ingest.mode,
        ingestReason: ingest.reason,
      }}
    />
  );
}
