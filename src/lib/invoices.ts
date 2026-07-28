import { Prisma } from "@prisma/client";
import { pushInAppNotification } from "@/lib/inAppNotify";
import { sendNotification } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus } from "@/lib/invoiceStatus";

export async function createInvoicesForEnrollment(enrollmentId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: true,
      user: true,
    },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") return [];

  const structures = await prisma.feeStructure.findMany({
    where: { courseId: enrollment.courseId, isActive: true },
    orderBy: { sequence: "asc" },
  });

  if (!structures.length) return [];

  const existing = await prisma.invoice.findMany({
    where: {
      enrollmentId,
      feeStructureId: { in: structures.map((s) => s.id) },
    },
    select: { feeStructureId: true },
  });
  const already = new Set(existing.map((e) => e.feeStructureId).filter(Boolean));

  const created = [];
  for (const fee of structures) {
    if (already.has(fee.id)) continue;
    const dueDate = fee.dueDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invoice = await prisma.invoice.create({
      data: {
        enrollmentId,
        feeStructureId: fee.id,
        amount: fee.amount,
        amountPaid: new Prisma.Decimal(0),
        status: "PENDING",
        dueDate,
      },
    });
    created.push(invoice);

    const amountLabel = Number(fee.amount).toFixed(2);
    const dueLabel = dueDate.toISOString().slice(0, 10);
    await sendNotification({
      userId: enrollment.userId,
      templateKey: "INVOICE_ISSUED",
      invoiceId: invoice.id,
      data: {
        studentName: enrollment.user.name || enrollment.user.email || "Student",
        amount: amountLabel,
        courseName: enrollment.course.name,
        dueDate: dueLabel,
      },
    }).catch(() => undefined);

    await pushInAppNotification({
      userId: enrollment.userId,
      type: "INVOICE_ISSUED",
      title: "New fee invoice",
      body: `₹${amountLabel} due ${dueLabel} for ${enrollment.course.name}.`,
      href: "/my-learning/fees",
    }).catch(() => undefined);
  }

  return created;
}

export async function recomputeInvoiceStatus(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return null;
  if (invoice.status === "WAIVED" || invoice.status === "CANCELLED") {
    return invoice;
  }

  const status = deriveInvoiceStatus({
    amount: invoice.amount,
    amountPaid: invoice.amountPaid,
    currentStatus: invoice.status,
  });

  if (status === invoice.status) return invoice;

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status },
  });
}
