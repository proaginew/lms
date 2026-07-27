import WatchTheater from "@/components/WatchTheater";
import { requireAppUser } from "@/lib/auth";
import { getOneDriveFolderMeta, listOneDriveFolderChildren } from "@/lib/graph";
import { cleanFileName, getTitlesForItems, webThumbnailFor } from "@/lib/videoTitles";
import { prisma } from "@/lib/prisma";
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
  } catch {
    notFound();
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

  return (
    <WatchTheater
      courseFolderId={folderId}
      courseName={courseName}
      currentId={fileId}
      currentTitle={current.title}
      currentTopic={current.topic}
      playlist={playlist}
    />
  );
}
