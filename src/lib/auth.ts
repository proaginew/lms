import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/adminEmails";
import { prisma } from "@/lib/prisma";

export async function getCurrentAppUser() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const clerkUser = await currentUser();
  if (!clerkUser) {
    return prisma.user.findUnique({ where: { clerkUserId: userId } });
  }

  const clerkEmail =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    null;
  const clerkName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    null;
  const clerkImageUrl = clerkUser.imageUrl ?? null;
  const shouldBeAdmin = isAdminEmail(clerkEmail);

  // upsert avoids race when parallel RSC requests both miss findUnique then create
  return prisma.user.upsert({
    where: { clerkUserId: userId },
    create: {
      clerkUserId: userId,
      email: clerkEmail,
      name: clerkName,
      imageUrl: clerkImageUrl,
      role: shouldBeAdmin ? "ADMIN" : "STUDENT",
      status: "active",
    },
    update: {
      email: clerkEmail,
      ...(clerkName ? { name: clerkName } : {}),
      ...(clerkImageUrl ? { imageUrl: clerkImageUrl } : {}),
      ...(shouldBeAdmin ? { role: "ADMIN" as const } : {}),
    },
  });
}

export async function requireAppUser() {
  const user = await getCurrentAppUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireAppUser();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export function hasApprovedAccess(
  status: string | null | undefined,
): boolean {
  return status === "APPROVED";
}
