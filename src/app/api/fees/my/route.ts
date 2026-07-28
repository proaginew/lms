import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await requireAppUser();
    const invoices = await prisma.invoice.findMany({
      where: { enrollment: { userId: user.id } },
      include: {
        enrollment: {
          include: { course: { select: { id: true, name: true, courseFolderId: true } } },
        },
        feeStructure: { select: { title: true, sequence: true } },
        payments: { orderBy: { paidAt: "desc" } },
      },
      orderBy: { dueDate: "asc" },
    });
    return NextResponse.json({ invoices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fees";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
