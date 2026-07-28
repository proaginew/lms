import { requireAppUser } from "@/lib/auth";
import {
  endWatchEvents,
  heartbeatWatchEvent,
  startWatchEvent,
} from "@/lib/analytics";
import {
  claimPlaybackSession,
  endPlaybackSession,
  heartbeatPlaybackSession,
} from "@/lib/playback";
import { getOneDriveFolderMeta } from "@/lib/graph";
import { prisma } from "@/lib/prisma";
import { assertStreamAccess, StreamAccessError } from "@/lib/streamAccess";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = (await request.json()) as {
      action?: "claim" | "heartbeat" | "end";
      courseFolderId?: string;
      itemId?: string;
      tabId?: string;
      token?: string;
    };

    const action = body.action ?? "claim";

    if (action === "end") {
      const itemId = body.itemId?.trim();
      await endPlaybackSession(user.id, body.token?.trim());
      await endWatchEvents(user.id, itemId);
      return NextResponse.json({ ok: true });
    }

    const tabId = body.tabId?.trim() ?? "";
    if (!tabId) {
      return NextResponse.json({ message: "tabId is required" }, { status: 400 });
    }

    if (action === "heartbeat") {
      const token = body.token?.trim() ?? "";
      const itemId = body.itemId?.trim() ?? "";
      if (!token) {
        return NextResponse.json({ message: "token is required" }, { status: 400 });
      }
      const session = await heartbeatPlaybackSession({
        userId: user.id,
        token,
        tabId,
      });
      if (!session) {
        return NextResponse.json({ message: "Session invalid" }, { status: 409 });
      }
      if (itemId) {
        await heartbeatWatchEvent(user.id, itemId);
      } else {
        await heartbeatWatchEvent(user.id, session.itemId);
      }
      return NextResponse.json({
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
      });
    }

    const courseFolderId = body.courseFolderId?.trim() ?? "";
    const itemId = body.itemId?.trim() ?? "";
    if (!courseFolderId || !itemId) {
      return NextResponse.json(
        { message: "courseFolderId and itemId are required" },
        { status: 400 },
      );
    }

    await assertStreamAccess({
      userId: user.id,
      role: user.role,
      courseFolderId,
    });
    const session = await claimPlaybackSession({
      userId: user.id,
      courseFolderId,
      itemId,
      tabId,
    });

    const asset = await prisma.videoAsset.findUnique({ where: { itemId } });
    let courseName = "Course";
    try {
      const course = await getOneDriveFolderMeta(courseFolderId);
      courseName = course.name;
    } catch {
      // keep default
    }

    await startWatchEvent({
      userId: user.id,
      courseFolderId,
      courseName,
      itemId,
      videoTitle: asset?.title?.trim() || asset?.fileName || "Video",
      subject: asset?.topic?.trim() || "General",
    });

    return NextResponse.json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      tabId: session.tabId,
    });
  } catch (error) {
    if (error instanceof StreamAccessError) {
      return NextResponse.json(
        { message: error.message, code: error.code, ...error.details },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "Playback session failed";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
