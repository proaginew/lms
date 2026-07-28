import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAppUser();
    const stories = await prisma.successStory.findMany({
      where: { isFeatured: true },
      orderBy: { createdAt: "desc" },
      include: { course: { select: { id: true, name: true } } },
      take: 12,
    });
    return NextResponse.json({ stories });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stories";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
