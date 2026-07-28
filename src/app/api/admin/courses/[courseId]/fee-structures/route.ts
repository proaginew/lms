import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

type RouteParams = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { courseId } = await params;
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ message: "Course not found" }, { status: 404 });
    }
    const feeStructures = await prisma.feeStructure.findMany({
      where: { courseId },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { invoices: true } } },
    });
    return NextResponse.json({ course, feeStructures });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fee structures";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { courseId } = await params;
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ message: "Course not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      title?: string;
      amount?: number | string;
      currency?: string;
      dueDate?: string | null;
      sequence?: number;
      isActive?: boolean;
    };

    const title = body.title?.trim() ?? "";
    const amount = Number(body.amount);
    if (!title || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ message: "title and amount are required" }, { status: 400 });
    }

    const feeStructure = await prisma.feeStructure.create({
      data: {
        courseId,
        title,
        amount: new Prisma.Decimal(amount),
        currency: body.currency?.trim() || "INR",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        sequence: Number.isFinite(body.sequence) ? Number(body.sequence) : 1,
        isActive: body.isActive !== false,
      },
    });

    return NextResponse.json({ feeStructure });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create fee structure";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
