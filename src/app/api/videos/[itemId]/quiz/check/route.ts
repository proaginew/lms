import { requireAppUser } from "@/lib/auth";
import { parseQuizJson } from "@/lib/videoQuiz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireAppUser();
    const { itemId: rawId } = await params;
    const itemId = decodeURIComponent(rawId).trim();
    const body = (await request.json()) as {
      questionId?: string;
      selected?: number;
    };
    const questionId = String(body.questionId || "").trim();
    const selected = Number(body.selected);

    if (!questionId || !Number.isFinite(selected) || selected < 0) {
      return NextResponse.json({ message: "Invalid answer" }, { status: 400 });
    }

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
    const question = quiz?.questions.find((q) => q.id === questionId);
    if (!question) {
      return NextResponse.json({ message: "Question not found" }, { status: 404 });
    }

    const correct = selected === question.correctIndex;

    return NextResponse.json({
      questionId,
      selected,
      correct,
      correctIndex: question.correctIndex,
      explanation: question.explanation || "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check failed";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
