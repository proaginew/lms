import { ensureCourseFromFolder } from "@/lib/courses";
import { createInvoicesForEnrollment } from "@/lib/invoices";
import { prisma } from "@/lib/prisma";

export async function activateEnrollmentOnApproval(input: {
  userId: string;
  courseFolderId: string;
  courseName: string;
}) {
  const course = await ensureCourseFromFolder({
    courseFolderId: input.courseFolderId,
    name: input.courseName,
  });

  const existing = await prisma.enrollment.findUnique({
    where: {
      userId_courseId: { userId: input.userId, courseId: course.id },
    },
  });

  const wasInactiveOrMissing = !existing || existing.status !== "ACTIVE";

  const enrollment = await prisma.enrollment.upsert({
    where: {
      userId_courseId: { userId: input.userId, courseId: course.id },
    },
    create: {
      userId: input.userId,
      courseId: course.id,
      status: "ACTIVE",
    },
    update: {
      status: "ACTIVE",
    },
  });

  // Only mint invoices when (re)activating — not on every approve call if already active.
  if (wasInactiveOrMissing) {
    await createInvoicesForEnrollment(enrollment.id);
  }

  return { course, enrollment };
}

export async function deactivateEnrollmentOnRevoke(input: {
  userId: string;
  courseFolderId: string;
}) {
  const course = await prisma.course.findUnique({
    where: { courseFolderId: input.courseFolderId.trim() },
  });
  if (!course) return null;

  const enrollment = await prisma.enrollment.updateMany({
    where: { userId: input.userId, courseId: course.id, status: "ACTIVE" },
    data: { status: "INACTIVE" },
  });

  return enrollment;
}
