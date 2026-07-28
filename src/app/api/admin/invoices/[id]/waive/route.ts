import { requireAdmin } from "@/lib/auth";
import { pushInAppNotification } from "@/lib/inAppNotify";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        enrollment: { include: { user: true, course: true } },
      },
    });
    if (!invoice) {
      return NextResponse.json({ message: "Invoice not found" }, { status: 404 });
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: "WAIVED" },
    });

    await pushInAppNotification({
      userId: invoice.enrollment.userId,
      type: "INVOICE_WAIVED",
      title: "Fee waived",
      body: `An invoice for ${invoice.enrollment.course.name} was waived by admin.`,
      href: "/my-learning/fees",
    }).catch(() => undefined);

    return NextResponse.json({ invoice: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to waive invoice";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
