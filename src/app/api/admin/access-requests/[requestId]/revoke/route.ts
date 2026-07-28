import { requireAdmin } from "@/lib/auth";
import { deactivateEnrollmentOnRevoke } from "@/lib/enrollment";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ requestId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { requestId } = await params;
    const body = (await req.json().catch(() => ({}))) as { rejectionReason?: string };
    const request = await prisma.accessRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      return NextResponse.json({ message: "Request not found" }, { status: 404 });
    }
    if (request.status !== "APPROVED") {
      return NextResponse.json({ message: "Only approved access can be revoked" }, { status: 400 });
    }
    const updated = await prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: "REVOKED",
        rejectionReason: body.rejectionReason?.trim() || "Revoked by admin",
        reviewedAt: new Date(),
      },
    });

    await deactivateEnrollmentOnRevoke({
      userId: updated.userId,
      courseFolderId: updated.courseFolderId,
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
