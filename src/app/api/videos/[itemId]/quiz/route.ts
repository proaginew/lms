import { requireAdmin, requireAppUser } from "@/lib/auth";
import { generateVideoQuiz, parseQuizJson } from "@/lib/videoQuiz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteParams = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireAppUser();
    const { itemId: rawId } = await params;
    const itemId = decodeURIComponent(rawId).trim();
    const row = await prisma.videoAsset.findUnique({ where: { itemId } });
    if (!row) {
      return NextResponse.json({
        itemId,
        quizStatus: "NONE",
        quiz: null,
      });
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

    const attempts = await prisma.quizAttempt.findMany({
      where: { userId: user.id, itemId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        score: true,
        maxScore: true,
        percent: true,
        xpAwarded: true,
        createdAt: true,
      },
    });

    const quiz =
      row.quizStatus === "READY" ? parseQuizJson(row.quizJson) : null;

    return NextResponse.json({
      itemId,
      title: row.title,
      quizStatus: row.quizStatus,
      quizError: row.quizError,
      notesStatus: row.notesStatus,
      quiz: quiz
        ? {
            title: quiz.title,
            questions: quiz.questions.map((q) => ({
              id: q.id,
              prompt: q.prompt,
              choices: q.choices,
              topic: q.topic,
            })),
          }
        : null,
      attempts,
      bestPercent: attempts.reduce((max, a) => Math.max(max, a.percent), 0),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load quiz";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** Admin-only: generate or regenerate quiz for this video. */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { itemId: rawId } = await params;
    const itemId = decodeURIComponent(rawId).trim();
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };

    const row = await generateVideoQuiz({
      itemId,
      force: body.force !== false,
    });

    const quiz =
      row.quizStatus === "READY" ? parseQuizJson(row.quizJson) : null;

    return NextResponse.json({
      itemId: row.itemId,
      quizStatus: row.quizStatus,
      quizError: row.quizError,
      notesStatus: row.notesStatus,
      quiz: quiz
        ? {
            title: quiz.title,
            questions: quiz.questions.map((q) => ({
              id: q.id,
              prompt: q.prompt,
              choices: q.choices,
              topic: q.topic,
            })),
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate quiz";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    if (message === "NOTES_NOT_READY") {
      return NextResponse.json(
        { message: "Generate lecture notes first, then create the quiz." },
        { status: 400 },
      );
    }
    if (message === "NOT_FOUND") {
      return NextResponse.json(
        { message: "Video not found in database yet" },
        { status: 404 },
      );
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
