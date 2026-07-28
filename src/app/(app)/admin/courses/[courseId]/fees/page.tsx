import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import CourseFeesManager from "@/components/CourseFeesManager";

export const dynamic = "force-dynamic";

export default async function AdminCourseFeesPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN") redirect("/");
  return <CourseFeesManager />;
}
