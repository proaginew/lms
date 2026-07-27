import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAdmin();
    const requests = await prisma.accessRequest.findMany({
      orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    return NextResponse.json({ requests });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load requests";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
