import { assertCronSecret } from "@/lib/contentAgent";
import { sendNotification } from "@/lib/notify";
import { pushInAppNotification } from "@/lib/inAppNotify";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetween(due: Date, today: Date) {
  const ms = startOfUtcDay(today).getTime() - startOfUtcDay(due).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

async function alreadyReminded(invoiceId: string, daysBeforeOrAfterDue: number) {
  const existing = await prisma.reminderLog.findFirst({
    where: { invoiceId, daysBeforeOrAfterDue },
  });
  return Boolean(existing);
}

export async function POST(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
    include: {
      enrollment: {
        include: {
          user: true,
          course: true,
        },
      },
    },
  });

  let reminders = 0;
  let markedOverdue = 0;

  for (const invoice of invoices) {
    const delta = daysBetween(invoice.dueDate, today);
    const remaining = Math.max(0, Number(invoice.amount) - Number(invoice.amountPaid));
    const data = {
      studentName:
        invoice.enrollment.user.name || invoice.enrollment.user.email || "Student",
      amount: remaining.toFixed(2),
      courseName: invoice.enrollment.course.name,
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      status: invoice.status,
    };

    // 3 days before due
    if (delta === -3 && (invoice.status === "PENDING" || invoice.status === "PARTIAL")) {
      if (!(await alreadyReminded(invoice.id, -3))) {
        await sendNotification({
          userId: invoice.enrollment.userId,
          templateKey: "FEE_DUE_REMINDER",
          invoiceId: invoice.id,
          data,
        });
        await prisma.reminderLog.create({
          data: { invoiceId: invoice.id, daysBeforeOrAfterDue: -3 },
        });
        reminders += 1;
      }
    }

    // On/after due: mark OVERDUE and remind every 3 days (0, 3, 6, ...)
    if (delta >= 0 && invoice.status !== "PAID" && invoice.status !== "WAIVED") {
      if (invoice.status === "PENDING" || invoice.status === "PARTIAL") {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: "OVERDUE" },
        });
        markedOverdue += 1;
      }

      if (delta % 3 === 0) {
        if (!(await alreadyReminded(invoice.id, delta))) {
          await sendNotification({
            userId: invoice.enrollment.userId,
            templateKey: "INVOICE_OVERDUE",
            invoiceId: invoice.id,
            data: { ...data, status: "OVERDUE" },
          });
          await pushInAppNotification({
            userId: invoice.enrollment.userId,
            type: "INVOICE_OVERDUE",
            title: "Fee overdue",
            body: `₹${data.amount} overdue for ${data.courseName}.`,
            href: "/my-learning/fees",
          }).catch(() => undefined);
          await prisma.reminderLog.create({
            data: { invoiceId: invoice.id, daysBeforeOrAfterDue: delta },
          });
          reminders += 1;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: invoices.length,
    reminders,
    markedOverdue,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
