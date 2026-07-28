import { requireAppUser } from "@/lib/auth";
import { ensureCourseFromFolder } from "@/lib/courses";
import { hasBlockingDues } from "@/lib/feeAccess";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await requireAppUser();
    const requests = await prisma.accessRequest.findMany({
      where: { userId: user.id },
      orderBy: { requestedAt: "desc" },
    });
    return NextResponse.json({ requests });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load requests";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = (await request.json()) as { courseFolderId?: string; courseName?: string };
    const courseFolderId = body.courseFolderId?.trim() ?? "";
    const courseName = body.courseName?.trim() ?? "";
    if (!courseFolderId || !courseName) {
      return NextResponse.json(
        { message: "Course is required" },
        { status: 400 },
      );
    }
    const email = user.email?.trim().toLowerCase() ?? "";
    if (!email) {
      return NextResponse.json({ message: "Account email is required" }, { status: 400 });
    }

    const course = await ensureCourseFromFolder({ courseFolderId, name: courseName });

    if (await hasBlockingDues(user.id, course.id)) {
      return NextResponse.json(
        {
          message: "Outstanding fee balance",
          code: "FEE_BLOCKED",
          href: "/my-learning/fees",
        },
        { status: 403 },
      );
    }

    const existing = await prisma.accessRequest.findUnique({
      where: { userId_courseFolderId: { userId: user.id, courseFolderId } },
    });
    if (existing?.status === "APPROVED") {
      return NextResponse.json({ message: "Already approved", request: existing });
    }
    if (existing?.status === "PENDING") {
      return NextResponse.json({ message: "Request already pending", request: existing });
    }

    const saved = await prisma.accessRequest.upsert({
      where: { userId_courseFolderId: { userId: user.id, courseFolderId } },
      update: {
        status: "PENDING",
        courseName,
        userEmail: email,
        rejectionReason: null,
        reviewedAt: null,
      },
      create: {
        userId: user.id,
        courseFolderId,
        courseName,
        userEmail: email,
        status: "PENDING",
      },
    });

    return NextResponse.json({ request: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit request";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
