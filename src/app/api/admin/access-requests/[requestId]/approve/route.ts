import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ requestId: string }> };

export async function POST(_: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { requestId } = await params;
    const request = await prisma.accessRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      return NextResponse.json({ message: "Request not found" }, { status: 404 });
    }
    const updated = await prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        rejectionReason: null,
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json({ request: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to approve";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
