import { requireAdmin } from "@/lib/auth";
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
    const updated = await prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        rejectionReason: body.rejectionReason?.trim() || "Rejected by admin",
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json({ request: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reject";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
