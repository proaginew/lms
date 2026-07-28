import { prisma } from "@/lib/prisma";

export async function pushInAppNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string;
}) {
  return prisma.userNotificationState.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href || null,
    },
  });
}
