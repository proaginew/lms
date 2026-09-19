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
  try {
    return await prisma.user.upsert({
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown database error";
    console.error("[auth] Failed to sync Clerk user:", detail);
    throw new Error(
      "Signed in, but the database could not save your user. On Vercel, set DATABASE_URL to the aimlms_simple database (not the older neondb LMS schema).",
    );
  }
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
