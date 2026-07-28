import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import type { AnnouncementType, Prisma } from "@prisma/client";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const data: Prisma.AnnouncementUpdateInput = {};
    if (typeof body.title === "string") data.title = body.title.trim();
    if (typeof body.description === "string") data.description = body.description.trim() || null;
    if (typeof body.imageUrl === "string") data.imageUrl = body.imageUrl.trim() || null;
    if (typeof body.ctaLabel === "string") data.ctaLabel = body.ctaLabel.trim() || null;
    if (typeof body.ctaHref === "string") data.ctaHref = body.ctaHref.trim() || null;
    if (body.courseId === null) data.course = { disconnect: true };
    else if (typeof body.courseId === "string" && body.courseId) {
      data.course = { connect: { id: body.courseId } };
    }
    if (typeof body.type === "string") data.type = body.type as AnnouncementType;
    if (typeof body.startAt === "string") data.startAt = new Date(body.startAt);
    if (body.endAt === null) data.endAt = null;
    else if (typeof body.endAt === "string") data.endAt = new Date(body.endAt);
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (typeof body.priority === "number") data.priority = body.priority;

    const announcement = await prisma.announcement.update({ where: { id }, data });
    return NextResponse.json({ announcement });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.announcement.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
