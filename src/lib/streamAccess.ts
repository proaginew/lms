import { hasBlockingDuesByFolder, getBlockingDueSummary } from "@/lib/feeAccess";
import { prisma } from "@/lib/prisma";

export class StreamAccessError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** AccessRequest approved + no blocking overdue fees for this course folder. */
export async function assertStreamAccess(input: {
  userId: string;
  role: string;
  courseFolderId: string;
}) {
  if (input.role === "ADMIN") return;

  const access = await prisma.accessRequest.findUnique({
    where: {
      userId_courseFolderId: {
        userId: input.userId,
        courseFolderId: input.courseFolderId,
      },
    },
  });
  if (access?.status !== "APPROVED") {
    throw new StreamAccessError("Forbidden", 403, "FORBIDDEN");
  }

  if (await hasBlockingDuesByFolder(input.userId, input.courseFolderId)) {
    const summary = await getBlockingDueSummary(input.userId, input.courseFolderId);
    throw new StreamAccessError(
      "Outstanding fee balance",
      403,
      "FEE_BLOCKED",
      summary
        ? {
            amountDue: summary.amountDue,
            dueDate: summary.dueDate,
            courseName: summary.courseName,
            href: "/my-learning/fees",
          }
        : { href: "/my-learning/fees" },
    );
  }
}
