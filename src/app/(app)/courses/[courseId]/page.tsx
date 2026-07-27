import Link from "next/link";
import CourseVideoTiles from "@/components/CourseVideoTiles";
import RequestAccessButton from "@/components/RequestAccessButton";
import { requireAppUser } from "@/lib/auth";
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
  } catch {
    notFound();
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
      <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          Back to courses
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">{course.name}</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
      thumbnailUrl:
        webThumbnailFor(
          video.id,
          cached?.title || cleanFileName(video.name) || video.name,
          cached?.topic ?? null,
        ),
      status: cached?.status || "PENDING",
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/" className="text-sm text-brand-600 hover:underline">
        Back to courses
      </Link>
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-gray-900">{course.name}</h1>
        <p className="mt-2 text-sm text-gray-500">
          Meeting titles come from transcription context and are saved in the database. Filter by
          topic or date anytime.
        </p>
      </div>

      <CourseVideoTiles
        courseFolderId={folderId}
        initialVideos={tiles}
        canEnrich={unlocked}
        isAdmin={isAdmin}
      />
    </div>
  );
}
