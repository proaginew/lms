import { prisma } from "@/lib/prisma";

export async function ensureCourseFromFolder(input: {
  courseFolderId: string;
  name: string;
}) {
  const courseFolderId = input.courseFolderId.trim();
  const name = input.name.trim() || "Course";
  if (!courseFolderId) {
    throw new Error("courseFolderId required");
  }

  return prisma.course.upsert({
    where: { courseFolderId },
    create: { courseFolderId, name },
    update: { name },
  });
}

export async function getCourseByFolderId(courseFolderId: string) {
  return prisma.course.findUnique({
    where: { courseFolderId: courseFolderId.trim() },
  });
}
