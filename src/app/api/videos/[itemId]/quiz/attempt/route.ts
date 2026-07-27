import { requireAppUser } from "@/lib/auth";
import { awardQuizXp } from "@/lib/gamification";
import { parseQuizJson } from "@/lib/videoQuiz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireAppUser();
    const { itemId: rawId } = await params;
    const itemId = decodeURIComponent(rawId).trim();
    const body = (await request.json()) as { answers?: Record<string, number> };
    const answers = body.answers || {};

    const row = await prisma.videoAsset.findUnique({ where: { itemId } });
    if (!row || row.quizStatus !== "READY") {
      return NextResponse.json({ message: "Quiz not ready" }, { status: 404 });
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

    const quiz = parseQuizJson(row.quizJson);
    if (!quiz) {
      return NextResponse.json({ message: "Invalid quiz" }, { status: 500 });
    }

    let score = 0;
    const details = quiz.questions.map((q) => {
      const selected = Number(answers[q.id]);
      const correct = selected === q.correctIndex;
      if (correct) score += 1;
      return {
        id: q.id,
        selected: Number.isFinite(selected) ? selected : -1,
        correctIndex: q.correctIndex,
        correct,
        explanation: q.explanation,
      };
    });

    const maxScore = quiz.questions.length;
    const percent = maxScore ? Math.round((score / maxScore) * 100) : 0;

    const previousBest = await prisma.quizAttempt.findFirst({
      where: { userId: user.id, itemId },
      orderBy: { percent: "desc" },
      select: { percent: true },
    });

    const { xpAwarded, profile } = await awardQuizXp({
      userId: user.id,
      itemId,
      percent,
      previousBestPercent: previousBest?.percent ?? null,
    });

    const attempt = await prisma.quizAttempt.create({
      data: {
        userId: user.id,
        itemId,
        courseFolderId: row.courseFolderId,
        score,
        maxScore,
        percent,
        answersJson: JSON.stringify(details),
        xpAwarded,
      },
    });

    return NextResponse.json({
      attemptId: attempt.id,
      score,
      maxScore,
      percent,
      xpAwarded,
      level: profile.level,
      totalXp: profile.totalXp,
      details,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submit failed";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
