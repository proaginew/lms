import { requireAdmin } from "@/lib/auth";
import { updateVideoMeta } from "@/lib/videoTitles";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ itemId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { itemId } = await params;
    const decodedItemId = decodeURIComponent(itemId).trim();
    const body = (await request.json()) as {
      title?: string;
      topic?: string | null;
      thumbnailUrl?: string | null;
      meetingDate?: string | null;
      courseFolderId?: string;
      fileName?: string;
    };

    if (body.title !== undefined && !body.title.trim()) {
      return NextResponse.json({ message: "Title is required" }, { status: 400 });
    }

    const row = await updateVideoMeta({
      itemId: decodedItemId,
      title: body.title,
      topic: body.topic,
      thumbnailUrl: body.thumbnailUrl,
      meetingDate: body.meetingDate,
      courseFolderId: body.courseFolderId,
      fileName: body.fileName,
    });

    return NextResponse.json({
      itemId: row.itemId,
      title: row.title,
      topic: row.topic,
      meetingDate: row.meetingDate?.toISOString().slice(0, 10) ?? null,
      thumbnailUrl: row.thumbnailUrl,
      status: row.status,
      fileName: row.fileName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update video";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    if (message === "NOT_FOUND") {
      return NextResponse.json({ message: "Video not found in database" }, { status: 404 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
