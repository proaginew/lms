import { prisma } from "@/lib/prisma";

/**
 * Returns true only when this course has an OVERDUE invoice for the user
 * AND an overdue reminder (daysBeforeOrAfterDue >= 0) has already been sent.
 */
export async function hasBlockingDues(userId: string, courseId: string): Promise<boolean> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") return false;

  const overdue = await prisma.invoice.findMany({
    where: {
      enrollmentId: enrollment.id,
      status: "OVERDUE",
    },
    select: { id: true },
  });
  if (!overdue.length) return false;

  for (const invoice of overdue) {
    const reminder = await prisma.reminderLog.findFirst({
      where: {
        invoiceId: invoice.id,
        daysBeforeOrAfterDue: { gte: 0 },
      },
    });
    if (reminder) return true;
  }

  return false;
}

export async function hasBlockingDuesByFolder(
  userId: string,
  courseFolderId: string,
): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { courseFolderId: courseFolderId.trim() },
  });
  if (!course) return false;
  return hasBlockingDues(userId, course.id);
}

export async function getBlockingDueSummary(userId: string, courseFolderId: string) {
  const course = await prisma.course.findUnique({
    where: { courseFolderId: courseFolderId.trim() },
  });
  if (!course) return null;
  const blocking = await hasBlockingDues(userId, course.id);
  if (!blocking) return null;

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  if (!enrollment) return null;

  const invoice = await prisma.invoice.findFirst({
    where: { enrollmentId: enrollment.id, status: "OVERDUE" },
    orderBy: { dueDate: "asc" },
  });
  if (!invoice) return null;

  return {
    courseId: course.id,
    courseName: course.name,
    amountDue: Math.max(0, Number(invoice.amount) - Number(invoice.amountPaid)),
    dueDate: invoice.dueDate.toISOString(),
    invoiceId: invoice.id,
  };
}
