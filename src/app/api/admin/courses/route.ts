import { requireAdmin } from "@/lib/auth";
import { ensureCourseFromFolder } from "@/lib/courses";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/** List DB courses (for fee admin). Optionally sync a OneDrive folder into Course. */
export async function GET() {
  try {
    await requireAdmin();
    const courses = await prisma.course.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { feeStructures: true, enrollments: true } },
      },
    });
    return NextResponse.json({ courses });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load courses";
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
    await requireAdmin();
    const body = (await request.json()) as {
      courseFolderId?: string;
      name?: string;
    };
    const courseFolderId = body.courseFolderId?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    if (!courseFolderId || !name) {
      return NextResponse.json(
        { message: "courseFolderId and name are required" },
        { status: 400 },
      );
    }
    const course = await ensureCourseFromFolder({ courseFolderId, name });
    return NextResponse.json({ course });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to ensure course";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
