import WatchTheater from "@/components/WatchTheater";
import { requireAppUser } from "@/lib/auth";
import { enqueueCourseContent, kickContentProcessing } from "@/lib/contentAgent";
import { getOneDriveFolderMeta, listOneDriveFolderChildren } from "@/lib/graph";
import { cleanFileName, getTitlesForItems, webThumbnailFor } from "@/lib/videoTitles";
import { getVideoNotes } from "@/lib/videoNotes";
import { prisma } from "@/lib/prisma";
import { after } from "next/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ courseId: string; itemId: string }>;
};

export default async function WatchPage({ params }: PageProps) {
  const { courseId, itemId } = await params;
  const folderId = decodeURIComponent(courseId);
  const fileId = decodeURIComponent(itemId);
  const user = await requireAppUser();
  const isAdmin = user.role === "ADMIN";

  const access = await prisma.accessRequest.findUnique({
    where: {
      userId_courseFolderId: {
        userId: user.id,
        courseFolderId: folderId,
      },
    },
  });
  if (!isAdmin && access?.status !== "APPROVED") {
    redirect(`/courses/${encodeURIComponent(folderId)}`);
  }

  let courseName = "Course";
  try {
    const course = await getOneDriveFolderMeta(folderId);
    courseName = course.name;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load course";
    if (/not found|404|itemNotFound/i.test(message)) {
      notFound();
    }
    throw error;
  }

  const files = await listOneDriveFolderChildren(folderId).catch(() => []);
  const videos = files.filter((file) => file.isVideo);
  if (!videos.some((video) => video.id === fileId)) {
    notFound();
  }

  const titleMap = await getTitlesForItems(videos.map((video) => video.id));
  const playlist = videos.map((video) => {
    const cached = titleMap.get(video.id);
    const title = cached?.title || cleanFileName(video.name) || video.name;
    const created = video.createdDateTime
      ? new Date(video.createdDateTime).toISOString().slice(0, 10)
      : null;
    return {
      id: video.id,
      title,
      topic: cached?.topic ?? null,
      meetingDate: cached?.meetingDate ?? created,
      thumbnailUrl: webThumbnailFor(video.id, title, cached?.topic ?? null),
    };
  });

  const current = playlist.find((item) => item.id === fileId)!;
  const initialNotes = await getVideoNotes(fileId);

  // Ensure this lecture (and siblings) get notes/quiz queued if missing.
  after(async () => {
    try {
      await enqueueCourseContent({
        courseFolderId: folderId,
        videos: videos.map((video) => ({ id: video.id, name: video.name })),
      });
      await kickContentProcessing(2);
    } catch {
      // Best-effort
    }
  });

  return (
    <WatchTheater
      courseFolderId={folderId}
      courseName={courseName}
      currentId={fileId}
      currentTitle={current.title}
      currentTopic={current.topic}
      currentMeetingDate={current.meetingDate}
      playlist={playlist}
      initialNotes={initialNotes}
      isAdmin={isAdmin}
    />
  );
}
