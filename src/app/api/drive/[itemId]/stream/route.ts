import { requireAppUser } from "@/lib/auth";
import { getOneDriveFileContentResponse } from "@/lib/graph";
import { validatePlaybackSession } from "@/lib/playback";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ itemId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const user = await requireAppUser();
    const { itemId } = await params;
    const decodedItemId = decodeURIComponent(itemId).trim();
    const url = new URL(request.url);
    const courseFolderId = url.searchParams.get("courseFolderId")?.trim() ?? "";
    const playbackToken =
      url.searchParams.get("playbackToken")?.trim() ||
      request.headers.get("x-playback-token")?.trim() ||
      "";

    if (!courseFolderId) {
      return NextResponse.json({ message: "Course is required" }, { status: 400 });
    }
    if (!playbackToken) {
      return NextResponse.json(
        { message: "Playback session required" },
        { status: 403 },
      );
    }

    if (user.role !== "ADMIN") {
      const access = await prisma.accessRequest.findUnique({
        where: {
          userId_courseFolderId: {
            userId: user.id,
            courseFolderId,
          },
        },
      });
      if (access?.status !== "APPROVED") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
    }

    const session = await validatePlaybackSession({
      userId: user.id,
      token: playbackToken,
      itemId: decodedItemId,
      courseFolderId,
    });
    if (!session) {
      return NextResponse.json(
        { message: "Playback session expired or invalid" },
        { status: 403 },
      );
    }

    const range = request.headers.get("range");
    const upstream = await getOneDriveFileContentResponse(decodedItemId, range);
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (contentType) headers.set("Content-Type", contentType);
    if (contentLength) headers.set("Content-Length", contentLength);
    if (contentRange) headers.set("Content-Range", contentRange);
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
    headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Content-Disposition", 'inline; filename="video"');
    headers.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stream file";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
