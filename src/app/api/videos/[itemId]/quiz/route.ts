import { requireAppUser } from "@/lib/auth";
import { parseQuizJson } from "@/lib/videoQuiz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
