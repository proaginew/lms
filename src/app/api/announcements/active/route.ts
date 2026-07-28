import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAppUser();
    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        startAt: { lte: now },
        OR: [{ endAt: null }, { endAt: { gte: now } }],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { course: { select: { id: true, name: true, courseFolderId: true } } },
      take: 20,
    });
    return NextResponse.json({ announcements });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load announcements";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
