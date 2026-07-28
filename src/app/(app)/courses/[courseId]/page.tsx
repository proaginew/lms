import { Suspense } from "react";
import Link from "next/link";
import { after } from "next/server";
import CourseVideoTiles from "@/components/CourseVideoTiles";
import RequestAccessButton from "@/components/RequestAccessButton";
import { requireAppUser } from "@/lib/auth";
import { enqueueCourseContent, kickContentProcessing } from "@/lib/contentAgent";
import { getOneDriveFolderMeta, listOneDriveFolderChildren } from "@/lib/graph";
import { cleanFileName, getTitlesForItems, webThumbnailFor } from "@/lib/videoTitles";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CourseDetailPage({ params }: PageProps) {
  const { courseId } = await params;
  const folderId = decodeURIComponent(courseId);
  const user = await requireAppUser();
  const isAdmin = user.role === "ADMIN";

  let course;
  try {
    course = await getOneDriveFolderMeta(folderId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load course";
    // Only treat true missing folders as 404; surface auth/network errors.
    if (/not found|404|itemNotFound/i.test(message)) {
      notFound();
    }
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Link href="/" className="text-sm text-[var(--yt-muted)] hover:text-[var(--yt-ink)]">
          ← Back to Home
        </Link>
        <h1 className="text-2xl font-semibold">Couldn’t open course</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      </div>
    );
  }

  const access = await prisma.accessRequest.findUnique({
    where: {
      userId_courseFolderId: {
        userId: user.id,
        courseFolderId: folderId,
      },
    },
  });

  const unlocked = isAdmin || access?.status === "APPROVED";

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Link href="/" className="text-sm text-[var(--yt-muted)] hover:text-[var(--yt-ink)]">
          ← Back to Home
        </Link>
        <h1 className="text-2xl font-semibold">{course.name}</h1>
        <div className="yt-card px-4 py-3 text-sm text-amber-800">
          This course is locked until an admin approves your access request.
        </div>
        {(access?.status === "REJECTED" || access?.status === "REVOKED") &&
          access.rejectionReason && (
            <p className="text-sm text-red-600">Reason: {access.rejectionReason}</p>
          )}
        <RequestAccessButton
          courseFolderId={course.id}
          courseName={course.name}
          disabled={access?.status === "PENDING"}
          label={access?.status === "PENDING" ? "Pending approval" : "Request access"}
        />
      </div>
    );
  }

  const files = await listOneDriveFolderChildren(folderId).catch(() => []);
  const videos = files.filter((file) => file.isVideo);
  const titleMap = await getTitlesForItems(videos.map((video) => video.id));
  const tiles = videos.map((video) => {
    const cached = titleMap.get(video.id);
    const created = video.createdDateTime
      ? new Date(video.createdDateTime).toISOString().slice(0, 10)
      : null;
    return {
      id: video.id,
      fileName: video.name,
      title: cached?.title || cleanFileName(video.name) || video.name,
      topic: cached?.topic ?? null,
      meetingDate: cached?.meetingDate ?? created,
      thumbnailUrl: webThumbnailFor(
        video.id,
        cached?.title || cleanFileName(video.name) || video.name,
        cached?.topic ?? null,
      ),
      status: cached?.status || "PENDING",
    };
  });

  // Queue missing notes/quizzes the moment any user opens the course, then process jobs.
  after(async () => {
    try {
      await enqueueCourseContent({
        courseFolderId: folderId,
        videos: videos.map((video) => ({ id: video.id, name: video.name })),
      });
      await kickContentProcessing(2);
    } catch {
      // Best-effort — cron will continue the queue.
    }
  });

  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="text-sm text-[var(--yt-muted)] hover:text-[var(--yt-ink)]">
          ← Home
        </Link>
        <h1 className="mt-2 text-xl font-semibold sm:text-2xl">{course.name}</h1>
        <p className="yt-meta mt-1">{tiles.length} videos</p>
      </div>

      <Suspense fallback={<p className="yt-meta">Loading videos…</p>}>
        <CourseVideoTiles
          courseFolderId={folderId}
          initialVideos={tiles}
          canEnrich={unlocked}
          isAdmin={isAdmin}
        />
      </Suspense>
    </div>
  );
}
