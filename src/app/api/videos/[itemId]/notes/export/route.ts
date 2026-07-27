import { requireAppUser } from "@/lib/auth";
import { getOneDriveFolderMeta } from "@/lib/graph";
import {
  buildNotesDocx,
  buildNotesPdf,
  notesFileBaseName,
  parseNotesJson,
} from "@/lib/videoNotes";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ itemId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const user = await requireAppUser();
    const { itemId: rawId } = await params;
    const itemId = decodeURIComponent(rawId).trim();
    const format = new URL(request.url).searchParams.get("format")?.toLowerCase();

    if (!itemId) {
      return NextResponse.json({ message: "Video is required" }, { status: 400 });
    }
    if (format !== "pdf" && format !== "docx") {
      return NextResponse.json(
        { message: "format must be pdf or docx" },
        { status: 400 },
      );
    }

    const row = await prisma.videoAsset.findUnique({ where: { itemId } });
    if (!row || row.notesStatus !== "READY" || !row.notesJson) {
      return NextResponse.json({ message: "Notes are not ready" }, { status: 404 });
    }

    if (user.role !== "ADMIN") {
      const access = await prisma.accessRequest.findUnique({
        where: {
          userId_courseFolderId: {
            userId: user.id,
            courseFolderId: row.courseFolderId,
          },
        },
      });
      if (access?.status !== "APPROVED") {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
    }

    const notes = parseNotesJson(row.notesJson);
    if (!notes) {
      return NextResponse.json({ message: "Notes are invalid" }, { status: 500 });
    }

    let courseName = "Course";
    try {
      const course = await getOneDriveFolderMeta(row.courseFolderId);
      courseName = course.name;
    } catch {
      // keep fallback
    }

    const title = row.title?.trim() || row.fileName;
    const meetingDate = row.meetingDate
      ? row.meetingDate.toISOString().slice(0, 10)
      : null;
    const base = notesFileBaseName(title);

    if (format === "pdf") {
      const bytes = await buildNotesPdf({
        title,
        topic: row.topic,
        meetingDate,
        courseName,
        notes,
      });
      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${base}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const docx = await buildNotesDocx({
      title,
      topic: row.topic,
      meetingDate,
      courseName,
      notes,
    });
    return new NextResponse(new Uint8Array(docx), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${base}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
