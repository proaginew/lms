import Image from "next/image";
import Link from "next/link";
import { after } from "next/server";
import RequestAccessButton from "@/components/RequestAccessButton";
import { requireAppUser } from "@/lib/auth";
import { ensureCourseFromFolder } from "@/lib/courses";
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

  // Sync OneDrive folders into Course rows so fee admin can manage them.
  if (courses.length) {
    after(async () => {
      try {
        await Promise.all(
          courses.map((course) =>
            ensureCourseFromFolder({ courseFolderId: course.id, name: course.name }),
          ),
        );
      } catch {
        // best-effort
      }
    });
  }

  const requests = await prisma.accessRequest.findMany({
    where: { userId: user.id },
    select: { courseFolderId: true, status: true, rejectionReason: true },
  });
  const byFolder = new Map(requests.map((r) => [r.courseFolderId, r]));

  const now = new Date();
  const [announcements, stories] = isAdmin
    ? [[], []]
    : await Promise.all([
        prisma.announcement.findMany({
          where: {
            isActive: true,
            startAt: { lte: now },
            OR: [{ endAt: null }, { endAt: { gte: now } }],
          },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 6,
        }),
        prisma.successStory.findMany({
          where: { isFeatured: true },
          orderBy: { createdAt: "desc" },
          take: 6,
          include: { course: { select: { name: true } } },
        }),
      ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Home</h1>
        <p className="yt-meta mt-1">
          {query ? `Results for “${q}”` : "Browse courses"}
        </p>
      </div>

      {!isAdmin && announcements.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Announcements</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {announcements.map((item) => (
              <article
                key={item.id}
                className="yt-card min-w-[260px] max-w-sm shrink-0 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--yt-muted)]">
                  {item.type}
                </p>
                <h3 className="mt-1 font-semibold">{item.title}</h3>
                {item.description ? (
                  <p className="mt-1 text-sm text-[var(--yt-muted)] line-clamp-3">
                    {item.description}
                  </p>
                ) : null}
                {item.ctaHref && item.ctaLabel ? (
                  <Link
                    href={item.ctaHref}
                    className="mt-3 inline-block text-sm text-[#0284c7] hover:underline"
                  >
                    {item.ctaLabel}
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      )}

      {!isAdmin && stories.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Success stories</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((story) => (
              <article key={story.id} className="yt-card p-4">
                <p className="font-semibold">{story.studentName}</p>
                <p className="text-sm text-[var(--yt-muted)]">
                  {story.jobTitle} · {story.companyName}
                </p>
                {story.course?.name ? (
                  <p className="mt-1 text-xs text-[#0284c7]">{story.course.name}</p>
                ) : null}
                {story.testimonial ? (
                  <p className="mt-2 text-sm line-clamp-4">{story.testimonial}</p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      )}

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
