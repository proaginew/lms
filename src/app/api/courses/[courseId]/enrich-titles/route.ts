import { requireAppUser } from "@/lib/auth";
import { listOneDriveFolderChildren } from "@/lib/graph";
import { enrichVideoTitle } from "@/lib/videoTitles";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ courseId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireAppUser();
    const { courseId } = await params;
    const courseFolderId = decodeURIComponent(courseId).trim();
    if (!courseFolderId) {
      return NextResponse.json({ message: "Course is required" }, { status: 400 });
    }

    if (user.role !== "ADMIN") {
      const access = await prisma.accessRequest.findUnique({
        where: {
          userId_courseFolderId: { userId: user.id, courseFolderId },
        },
      });
      if (access?.status !== "APPROVED") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
    }

    const body = (await request.json().catch(() => ({}))) as {
      itemId?: string;
      force?: boolean;
      onlyMissing?: boolean;
    };
    const force = Boolean(body.force);
    // Default: only generate for rows never saved as READY/FAILED.
    const onlyMissing = body.onlyMissing !== false && !force;

    const files = await listOneDriveFolderChildren(courseFolderId);
    const videos = files.filter((file) => file.isVideo);
    const itemId = body.itemId?.trim();
    let targets = itemId
      ? videos.filter((video) => video.id === itemId)
      : videos;

    if (onlyMissing) {
      const existing = await prisma.videoAsset.findMany({
        where: {
          itemId: { in: targets.map((video) => video.id) },
          status: { in: ["READY", "FAILED"] },
        },
        select: { itemId: true },
      });
      const done = new Set(existing.map((row) => row.itemId));
      targets = targets.filter((video) => !done.has(video.id));
    }

    if (targets.length === 0) {
      const cached = await prisma.videoAsset.findMany({
        where: { courseFolderId },
      });
      return NextResponse.json({
        message: "All meeting titles already saved",
        generated: 0,
        titles: cached.map((row) => ({
          itemId: row.itemId,
          title: row.title ?? row.fileName,
          topic: row.topic,
          meetingDate: row.meetingDate?.toISOString().slice(0, 10) ?? null,
          thumbnailUrl: row.thumbnailUrl,
          status: row.status,
          fileName: row.fileName,
        })),
      });
    }

    const titles: Array<{
      itemId: string;
      title: string;
      topic: string | null;
      meetingDate: string | null;
      thumbnailUrl: string | null;
      status: string;
      fileName: string;
    }> = [];

    for (const video of targets) {
      const row = await enrichVideoTitle({
        itemId: video.id,
        courseFolderId,
        fileName: video.name,
        createdDateTime: video.createdDateTime,
        force,
      });
      titles.push({
        itemId: row.itemId,
        title: row.title ?? video.name,
        topic: row.topic,
        meetingDate: row.meetingDate?.toISOString().slice(0, 10) ?? null,
        thumbnailUrl: row.thumbnailUrl,
        status: row.status,
        fileName: row.fileName,
      });
    }

    return NextResponse.json({ generated: titles.length, titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enrich titles";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
