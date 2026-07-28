import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const data: Prisma.SuccessStoryUpdateInput = {};
    if (typeof body.studentName === "string") data.studentName = body.studentName.trim();
    if (typeof body.photoUrl === "string") data.photoUrl = body.photoUrl.trim() || null;
    if (body.courseId === null) data.course = { disconnect: true };
    else if (typeof body.courseId === "string" && body.courseId) {
      data.course = { connect: { id: body.courseId } };
    }
    if (typeof body.companyName === "string") data.companyName = body.companyName.trim();
    if (typeof body.jobTitle === "string") data.jobTitle = body.jobTitle.trim();
    if (typeof body.testimonial === "string") data.testimonial = body.testimonial.trim() || null;
    if (body.placedAt === null) data.placedAt = null;
    else if (typeof body.placedAt === "string") data.placedAt = new Date(body.placedAt);
    if (typeof body.isFeatured === "boolean") data.isFeatured = body.isFeatured;

    const story = await prisma.successStory.update({ where: { id }, data });
    return NextResponse.json({ story });
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
    await prisma.successStory.delete({ where: { id } });
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
