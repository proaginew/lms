import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import type { AnnouncementType } from "@prisma/client";

export async function GET() {
  try {
    await requireAdmin();
    const announcements = await prisma.announcement.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { course: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ announcements });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      imageUrl?: string;
      ctaLabel?: string;
      ctaHref?: string;
      courseId?: string | null;
      type?: AnnouncementType;
      startAt?: string;
      endAt?: string | null;
      isActive?: boolean;
      priority?: number;
    };
    const title = body.title?.trim() ?? "";
    if (!title) {
      return NextResponse.json({ message: "title is required" }, { status: 400 });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        description: body.description?.trim() || null,
        imageUrl: body.imageUrl?.trim() || null,
        ctaLabel: body.ctaLabel?.trim() || null,
        ctaHref: body.ctaHref?.trim() || null,
        courseId: body.courseId || null,
        type: body.type || "GENERAL",
        startAt: body.startAt ? new Date(body.startAt) : new Date(),
        endAt: body.endAt ? new Date(body.endAt) : null,
        isActive: body.isActive !== false,
        priority: Number.isFinite(body.priority) ? Number(body.priority) : 0,
        createdById: admin.id,
      },
    });
    return NextResponse.json({ announcement });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
