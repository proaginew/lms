import { requireAdmin } from "@/lib/auth";
import { recomputeInvoiceStatus } from "@/lib/invoices";
import { pushInAppNotification } from "@/lib/inAppNotify";
import { sendNotification } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma, type PaymentMethod } from "@prisma/client";

type RouteParams = { params: Promise<{ id: string }> };

const METHODS: PaymentMethod[] = [
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "UPI_MANUAL",
  "OTHER",
];

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const admin = await requireAdmin();
    const { id: invoiceId } = await params;
    const body = (await request.json()) as {
      amount?: number | string;
      method?: string;
      referenceNo?: string;
      notes?: string;
      paidAt?: string;
    };

    const amount = Number(body.amount);
    const method = body.method as PaymentMethod;
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ message: "Valid amount is required" }, { status: 400 });
    }
    if (!METHODS.includes(method)) {
      return NextResponse.json({ message: "Invalid payment method" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        enrollment: {
          include: {
            user: true,
            course: true,
          },
        },
      },
    });
    if (!invoice) {
      return NextResponse.json({ message: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "WAIVED" || invoice.status === "CANCELLED") {
      return NextResponse.json(
        { message: "Cannot record payment on waived/cancelled invoice" },
        { status: 400 },
      );
    }

    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        amount: new Prisma.Decimal(amount),
        method,
        referenceNo: body.referenceNo?.trim() || null,
        notes: body.notes?.trim() || null,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        recordedById: admin.id,
      },
    });

    const newPaid = Number(invoice.amountPaid) + amount;
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid: new Prisma.Decimal(newPaid) },
    });
    const updated = await recomputeInvoiceStatus(invoiceId);

    const student = invoice.enrollment.user;
    const courseName = invoice.enrollment.course.name;
    const amountLabel = amount.toFixed(2);

    await sendNotification({
      userId: student.id,
      templateKey: "PAYMENT_RECEIVED",
      invoiceId,
      data: {
        studentName: student.name || student.email || "Student",
        amount: amountLabel,
        courseName,
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        status: updated?.status || "",
      },
    }).catch(() => undefined);

    await pushInAppNotification({
      userId: student.id,
      type: "PAYMENT_RECEIVED",
      title: "Payment recorded",
      body: `₹${amountLabel} received for ${courseName}.`,
      href: "/my-learning/fees",
    }).catch(() => undefined);

    return NextResponse.json({ payment, invoice: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record payment";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
