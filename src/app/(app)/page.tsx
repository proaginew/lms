import Image from "next/image";
import Link from "next/link";
import RequestAccessButton from "@/components/RequestAccessButton";
import { requireAppUser } from "@/lib/auth";
import { listOneDriveCourses } from "@/lib/graph";
import { webThumbnailFor } from "@/lib/videoTitles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function badgeClass(status: string | null) {
  if (status === "APPROVED") {
    return "border-green-200 bg-green-50 text-green-700";
  }
  if (status === "PENDING") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "REJECTED" || status === "REVOKED") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-gray-200 bg-gray-50 text-gray-600";
}

export default async function CoursesPage() {
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

  const requests = await prisma.accessRequest.findMany({
    where: { userId: user.id },
    select: { courseFolderId: true, status: true, rejectionReason: true },
  });
  const byFolder = new Map(requests.map((r) => [r.courseFolderId, r]));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Courses</h2>
        <p className="mt-1 text-sm text-gray-500">
          Request access to unlock a course. An admin will review your request.
        </p>
      </div>

      {coursesError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {coursesError}
        </div>
      )}

      {!coursesError && courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-500">
          No courses available yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => {
            const req = byFolder.get(course.id);
            const status = req?.status ?? null;
            const unlocked = isAdmin || status === "APPROVED";
            const thumb = webThumbnailFor(course.id, course.name, "Course");
            return (
              <div
                key={course.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                {unlocked ? (
                  <Link
                    href={`/courses/${encodeURIComponent(course.id)}`}
                    className="group relative block aspect-video overflow-hidden bg-slate-800"
                  >
                    <Image
                      src={thumb}
                      alt={course.name}
                      fill
                      className="object-cover transition group-hover:scale-[1.02]"
                      sizes="(max-width: 640px) 100vw, 33vw"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-black/15" />
                  </Link>
                ) : (
                  <div className="relative aspect-video overflow-hidden bg-slate-800">
                    <Image
                      src={thumb}
                      alt={course.name}
                      fill
                      className="object-cover opacity-80"
                      sizes="(max-width: 640px) 100vw, 33vw"
                      unoptimized
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                        Locked
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-2 text-base font-semibold text-gray-900">
                      {course.name}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeClass(
                        isAdmin ? "APPROVED" : status,
                      )}`}
                    >
                      {isAdmin ? "ADMIN" : status ?? "LOCKED"}
                    </span>
                  </div>
                  {(status === "REJECTED" || status === "REVOKED") && req?.rejectionReason && (
                    <p className="text-xs text-red-600">Reason: {req.rejectionReason}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {unlocked ? (
                      <Link
                        href={`/courses/${encodeURIComponent(course.id)}`}
                        className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
                      >
                        Open course
                      </Link>
                    ) : (
                      <RequestAccessButton
                        courseFolderId={course.id}
                        courseName={course.name}
                        disabled={status === "PENDING"}
                        label={status === "PENDING" ? "Pending approval" : "Request access"}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
