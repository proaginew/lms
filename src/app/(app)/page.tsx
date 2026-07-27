import Image from "next/image";
import Link from "next/link";
import RequestAccessButton from "@/components/RequestAccessButton";
import { requireAppUser } from "@/lib/auth";
import { listOneDriveCourses } from "@/lib/graph";
import { accentClass } from "@/lib/tileAccent";
import { webThumbnailFor } from "@/lib/videoTitles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

function statusBadgeClass(status: string | null, isAdmin: boolean) {
  if (isAdmin) return "yt-badge yt-badge-admin";
  if (status === "APPROVED") return "yt-badge yt-badge-approved";
  if (status === "PENDING") return "yt-badge yt-badge-pending";
  if (status === "REJECTED" || status === "REVOKED") return "yt-badge yt-badge-rejected";
  return "yt-badge yt-badge-locked";
}

export default async function CoursesPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = q?.trim().toLowerCase() ?? "";
  const user = await requireAppUser();
  const isAdmin = user.role === "ADMIN";

  let coursesError: string | null = null;
  let courses: Array<{ id: string; name: string }> = [];
  try {
    const listed = await listOneDriveCourses();
    courses = listed.courses;
  } catch (error) {
    coursesError = error instanceof Error ? error.message : "Failed to load courses";
  }

  if (query) {
    courses = courses.filter((course) => course.name.toLowerCase().includes(query));
  }

  const requests = await prisma.accessRequest.findMany({
    where: { userId: user.id },
    select: { courseFolderId: true, status: true, rejectionReason: true },
  });
  const byFolder = new Map(requests.map((r) => [r.courseFolderId, r]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Home</h1>
        <p className="yt-meta mt-1">
          {query ? `Results for “${q}”` : "Browse courses"}
        </p>
      </div>

      {coursesError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {coursesError}
        </div>
      )}

      {!coursesError && courses.length === 0 ? (
        <div className="yt-card p-8 text-sm text-[var(--yt-muted)]">
          {query ? "No courses match your search." : "No courses available yet."}
        </div>
      ) : (
        <div className="yt-grid">
          {courses.map((course) => {
            const req = byFolder.get(course.id);
            const status = req?.status ?? null;
            const unlocked = isAdmin || status === "APPROVED";
            const thumb = webThumbnailFor(course.id, course.name, "Course");
            const statusLabel = isAdmin ? "Admin" : status ?? "Locked";
            const accent = accentClass(course.id);

            const thumbBlock = (
              <div className="yt-thumb group">
                <Image
                  src={thumb}
                  alt={course.name}
                  fill
                  className="object-cover transition duration-200 group-hover:scale-[1.03]"
                  sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
                  unoptimized
                  priority
                />
                {!unlocked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
                      Locked
                    </span>
                  </div>
                )}
              </div>
            );

            return (
              <article key={course.id} className={`yt-tile ${accent}`}>
                {unlocked ? (
                  <Link href={`/courses/${encodeURIComponent(course.id)}`}>{thumbBlock}</Link>
                ) : (
                  thumbBlock
                )}

                <div className="yt-tile-body space-y-1.5">
                  {unlocked ? (
                    <Link href={`/courses/${encodeURIComponent(course.id)}`}>
                      <h3 className="yt-title hover:underline">{course.name}</h3>
                    </Link>
                  ) : (
                    <h3 className="yt-title">{course.name}</h3>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={statusBadgeClass(status, isAdmin)}>{statusLabel}</span>
                    <span className="yt-badge yt-badge-accent">Course</span>
                  </div>
                  {(status === "REJECTED" || status === "REVOKED") && req?.rejectionReason && (
                    <p className="text-[11px] text-red-600 sm:text-xs">
                      Reason: {req.rejectionReason}
                    </p>
                  )}
                  {!unlocked && (
                    <div className="pt-1">
                      <RequestAccessButton
                        courseFolderId={course.id}
                        courseName={course.name}
                        disabled={status === "PENDING"}
                        label={status === "PENDING" ? "Pending" : "Request"}
                      />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
