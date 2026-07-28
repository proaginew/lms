import { sendEmail } from "@/lib/providers/sendgrid";
import { sendSms } from "@/lib/providers/twilio";
import { prisma } from "@/lib/prisma";
import type { NotificationChannel } from "@prisma/client";

function interpolate(template: string, data: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => data[key] ?? "");
}

async function logAttempt(input: {
  userId: string;
  templateKey: string;
  channel: NotificationChannel;
  status: "SENT" | "FAILED";
  providerRef?: string;
  invoiceId?: string;
  error?: string;
}) {
  try {
    await prisma.notificationLog.create({
      data: {
        userId: input.userId,
        templateKey: input.templateKey,
        channel: input.channel,
        status: input.status,
        providerRef: input.providerRef || null,
        invoiceId: input.invoiceId || null,
        error: input.error?.slice(0, 500) || null,
      },
    });
  } catch {
    // Audit write must never throw uncaught to callers
  }
}

export async function sendNotification(input: {
  userId: string;
  templateKey: string;
  data: Record<string, string>;
  invoiceId?: string;
}): Promise<void> {
  const template = await prisma.notificationTemplate.findUnique({
    where: { key: input.templateKey },
  });
  if (!template) {
    await logAttempt({
      userId: input.userId,
      templateKey: input.templateKey,
      channel: "EMAIL",
      status: "FAILED",
      invoiceId: input.invoiceId,
      error: `Template ${input.templateKey} not found`,
    });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) {
    await logAttempt({
      userId: input.userId,
      templateKey: input.templateKey,
      channel: template.channel,
      status: "FAILED",
      invoiceId: input.invoiceId,
      error: "User not found",
    });
    return;
  }

  const subject = interpolate(template.subject || "AIM LMS", input.data);
  const body = interpolate(template.body, input.data);
  const wantEmail = template.channel === "EMAIL" || template.channel === "BOTH";
  const wantSms = template.channel === "SMS" || template.channel === "BOTH";

  if (wantEmail) {
    if (!user.email) {
      await logAttempt({
        userId: input.userId,
        templateKey: input.templateKey,
        channel: "EMAIL",
        status: "FAILED",
        invoiceId: input.invoiceId,
        error: "User has no email",
      });
    } else {
      try {
        const result = await sendEmail({ to: user.email, subject, body });
        await logAttempt({
          userId: input.userId,
          templateKey: input.templateKey,
          channel: "EMAIL",
          status: "SENT",
          providerRef: result.id,
          invoiceId: input.invoiceId,
        });
      } catch (error) {
        await logAttempt({
          userId: input.userId,
          templateKey: input.templateKey,
          channel: "EMAIL",
          status: "FAILED",
          invoiceId: input.invoiceId,
          error: error instanceof Error ? error.message : "Email failed",
        });
      }
    }
  }

  if (wantSms) {
    if (!user.phone) {
      await logAttempt({
        userId: input.userId,
        templateKey: input.templateKey,
        channel: "SMS",
        status: "FAILED",
        invoiceId: input.invoiceId,
        error: "User has no phone",
      });
    } else {
      try {
        const result = await sendSms({ to: user.phone, body });
        await logAttempt({
          userId: input.userId,
          templateKey: input.templateKey,
          channel: "SMS",
          status: "SENT",
          providerRef: result.id,
          invoiceId: input.invoiceId,
        });
      } catch (error) {
        await logAttempt({
          userId: input.userId,
          templateKey: input.templateKey,
          channel: "SMS",
          status: "FAILED",
          invoiceId: input.invoiceId,
          error: error instanceof Error ? error.message : "SMS failed",
        });
      }
    }
  }
}
