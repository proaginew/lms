import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getContentModel } from "@/lib/openaiModels";

export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
};

export type VideoQuizContent = {
  title: string;
  questions: QuizQuestion[];
};

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

export function parseQuizJson(raw: string | null | undefined): VideoQuizContent | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VideoQuizContent>;
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
          .map((q, index) => {
            const choices = Array.isArray(q?.choices)
              ? q.choices.map((c) => String(c).trim()).filter(Boolean).slice(0, 4)
              : [];
            const correctIndex = Number(q?.correctIndex);
            if (choices.length < 2 || Number.isNaN(correctIndex)) return null;
            return {
              id: String(q?.id ?? `q${index + 1}`),
              prompt: String(q?.prompt ?? "").trim(),
              choices,
              correctIndex: Math.max(0, Math.min(choices.length - 1, correctIndex)),
              explanation: String(q?.explanation ?? "").trim(),
              topic: String(q?.topic ?? "").trim() || "General",
            };
          })
          .filter((q): q is QuizQuestion => Boolean(q?.prompt))
      : [];
    if (!questions.length) return null;
    return {
      title: (parsed.title ?? "").trim() || "Lecture quiz",
      questions: questions.slice(0, 20),
    };
  } catch {
    return null;
  }
}

export async function generateVideoQuiz(input: {
  itemId: string;
  force?: boolean;
}) {
  const existing = await prisma.videoAsset.findUnique({ where: { itemId: input.itemId } });
  if (!existing) throw new Error("NOT_FOUND");
  if (!input.force && existing.quizStatus === "READY" && existing.quizJson) {
    return existing;
  }
  if (existing.notesStatus !== "READY" || !existing.notesJson) {
    throw new Error("NOTES_NOT_READY");
  }

  await prisma.videoAsset.update({
    where: { itemId: input.itemId },
    data: { quizStatus: "PENDING", quizError: null },
  });

  try {
    const openai = getOpenAI();
    const notes = existing.notesJson.slice(0, 20000);
    const transcript = (existing.transcriptFull || existing.transcriptPreview || "").slice(
      0,
      12000,
    );
    const completion = await openai.chat.completions.create({
      model: getContentModel(),
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Create a rigorous, exam-quality multiple-choice quiz from lecture notes/transcript.
Return JSON:
{
  "title": string,
  "questions": [{
    "id": string,
    "prompt": string,
    "choices": [string, string, string, string],
    "correctIndex": number,
    "explanation": string,
    "topic": string
  }]
}
Rules:
- 12-20 questions covering major topics thoroughly (prefer ~15-18 for long lectures).
- Mix recall, understanding, and application; avoid trivial wording tricks.
- Exactly 4 choices; one correct; strong plausible distractors.
- correctIndex is 0-based.
- Explanations must teach why the answer is right and why others are wrong.
- No markdown/emojis.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            title: existing.title,
            topic: existing.topic,
            notes,
            transcriptExcerpt: transcript,
          }),
        },
      ],
    });

    const quiz = parseQuizJson(completion.choices[0]?.message?.content?.trim() ?? "{}");
    if (!quiz) throw new Error("Invalid quiz JSON from model");

    return prisma.videoAsset.update({
      where: { itemId: input.itemId },
      data: {
        quizJson: JSON.stringify(quiz),
        quizStatus: "READY",
        quizError: null,
        quizGeneratedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quiz generation failed";
    return prisma.videoAsset.update({
      where: { itemId: input.itemId },
      data: {
        quizStatus: "FAILED",
        quizError: message.slice(0, 500),
      },
    });
  }
}
