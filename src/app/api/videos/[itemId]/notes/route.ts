import { requireAdmin, requireAppUser } from "@/lib/auth";
import { generateVideoNotes, getVideoNotes, parseNotesJson } from "@/lib/videoNotes";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteParams = { params: Promise<{ itemId: string }> };

async function assertCourseAccess(userId: string, role: string, courseFolderId: string) {
  if (role === "ADMIN") return;
  const access = await prisma.accessRequest.findUnique({
    where: {
      userId_courseFolderId: { userId, courseFolderId },
    },
  });
  if (access?.status !== "APPROVED") {
    throw new Error("FORBIDDEN");
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireAppUser();
    const { itemId: rawId } = await params;
    const itemId = decodeURIComponent(rawId).trim();
    if (!itemId) {
      return NextResponse.json({ message: "Video is required" }, { status: 400 });
    }

    const notes = await getVideoNotes(itemId);
    if (!notes) {
      return NextResponse.json({
        itemId,
        notesStatus: "NONE",
        notes: null,
        notesError: null,
        notesGeneratedAt: null,
      });
    }

    await assertCourseAccess(user.id, user.role, notes.courseFolderId);
    return NextResponse.json(notes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notes";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** Admin-only: force regenerate notes (students never trigger OpenAI). */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { itemId: rawId } = await params;
    const itemId = decodeURIComponent(rawId).trim();
    const body = (await request.json().catch(() => ({}))) as {
      courseFolderId?: string;
      force?: boolean;
    };

    const existing = await prisma.videoAsset.findUnique({ where: { itemId } });
    const courseFolderId =
      body.courseFolderId?.trim() || existing?.courseFolderId?.trim() || "";
    if (!courseFolderId) {
      return NextResponse.json({ message: "Course is required" }, { status: 400 });
    }

    const row = await generateVideoNotes({
      itemId,
      courseFolderId,
      force: body.force !== false,
    });

    return NextResponse.json({
      itemId: row.itemId,
      title: row.title,
      topic: row.topic,
      meetingDate: row.meetingDate?.toISOString().slice(0, 10) ?? null,
      courseFolderId: row.courseFolderId,
      notesStatus: row.notesStatus,
      notesError: row.notesError,
      notesGeneratedAt: row.notesGeneratedAt?.toISOString() ?? null,
      notes: parseNotesJson(row.notesJson),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate notes";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
