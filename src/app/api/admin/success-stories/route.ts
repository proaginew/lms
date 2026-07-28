import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAdmin();
    const stories = await prisma.successStory.findMany({
      orderBy: { createdAt: "desc" },
      include: { course: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ stories });
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
      studentName?: string;
      photoUrl?: string;
      courseId?: string | null;
      companyName?: string;
      jobTitle?: string;
      testimonial?: string;
      placedAt?: string | null;
      isFeatured?: boolean;
    };
    const studentName = body.studentName?.trim() ?? "";
    const companyName = body.companyName?.trim() ?? "";
    const jobTitle = body.jobTitle?.trim() ?? "";
    if (!studentName || !companyName || !jobTitle) {
      return NextResponse.json(
        { message: "studentName, companyName, and jobTitle are required" },
        { status: 400 },
      );
    }

    const story = await prisma.successStory.create({
      data: {
        studentName,
        photoUrl: body.photoUrl?.trim() || null,
        courseId: body.courseId || null,
        companyName,
        jobTitle,
        testimonial: body.testimonial?.trim() || null,
        placedAt: body.placedAt ? new Date(body.placedAt) : null,
        isFeatured: body.isFeatured !== false,
        createdById: admin.id,
      },
    });
    return NextResponse.json({ story });
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
