import { requireAdmin } from "@/lib/auth";
import { parseNotesJson, type VideoNotesContent } from "@/lib/videoNotes";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ itemId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { itemId: rawId } = await params;
    const itemId = decodeURIComponent(rawId).trim();
    const body = (await request.json()) as { notes?: VideoNotesContent };

    if (!body.notes) {
      return NextResponse.json({ message: "notes required" }, { status: 400 });
    }

    const normalized = parseNotesJson(JSON.stringify(body.notes));
    if (!normalized) {
      return NextResponse.json({ message: "Invalid notes" }, { status: 400 });
    }

    const row = await prisma.videoAsset.update({
      where: { itemId },
      data: {
        notesJson: JSON.stringify(normalized),
        notesStatus: "READY",
        notesError: null,
        notesUpdatedAt: new Date(),
        notesGeneratedAt: new Date(),
      },
    });

    return NextResponse.json({
      itemId: row.itemId,
      notesStatus: row.notesStatus,
      notes: normalized,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save notes";
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
      return NextResponse.json({ message }, { status: message === "UNAUTHORIZED" ? 401 : 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
