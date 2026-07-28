import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await requireAppUser();
    const notifications = await prisma.userNotificationState.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const unread = notifications.filter((n) => !n.readAt).length;
    return NextResponse.json({ notifications, unread });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notifications";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = (await request.json().catch(() => ({}))) as {
      action?: "mark_read" | "mark_all_read";
      id?: string;
    };

    if (body.action === "mark_all_read") {
      await prisma.userNotificationState.updateMany({
        where: { userId: user.id, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "mark_read" && body.id) {
      await prisma.userNotificationState.updateMany({
        where: { id: body.id, userId: user.id },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ message: "Invalid action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
