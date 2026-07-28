import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id: studentId } = await params;
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!student) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    const invoices = await prisma.invoice.findMany({
      where: { enrollment: { userId: studentId } },
      include: {
        enrollment: {
          include: { course: { select: { id: true, name: true } } },
        },
        feeStructure: true,
        payments: { orderBy: { paidAt: "desc" } },
      },
      orderBy: { dueDate: "asc" },
    });

    return NextResponse.json({ student, invoices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load student invoices";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
