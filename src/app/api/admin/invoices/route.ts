import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim();
    const courseId = searchParams.get("courseId")?.trim();
    const studentId = searchParams.get("studentId")?.trim();

    const invoices = await prisma.invoice.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(courseId || studentId
          ? {
              enrollment: {
                ...(courseId ? { courseId } : {}),
                ...(studentId ? { userId: studentId } : {}),
              },
            }
          : {}),
      },
      include: {
        enrollment: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            course: { select: { id: true, name: true, courseFolderId: true } },
          },
        },
        feeStructure: { select: { id: true, title: true, sequence: true } },
        payments: { orderBy: { paidAt: "desc" }, take: 5 },
      },
      orderBy: [{ dueDate: "asc" }, { issuedAt: "desc" }],
      take: 200,
    });

    return NextResponse.json({ invoices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load invoices";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
