import { requireAppUser } from "@/lib/auth";
import { getActiveLearners } from "@/lib/analytics";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await requireAppUser();
    const active = await getActiveLearners();
    if (user.role === "ADMIN") {
      return NextResponse.json({
        count: active.length,
        learners: active.map((row) => ({
          userId: row.userId,
          name: row.name || row.email || "Learner",
          courseName: row.courseName,
          videoTitle: row.videoTitle,
          subject: row.subject,
          lastSeenAt: row.lastSeenAt,
        })),
      });
    }
    return NextResponse.json({ count: active.length, learners: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
