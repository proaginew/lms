"use client";

import { useEffect, useState, useTransition } from "react";

type QuizChoiceView = {
  id: string;
  prompt: string;
  choices: string[];
  topic: string;
};

type Attempt = {
  id: string;
  score: number;
  maxScore: number;
  percent: number;
  xpAwarded: number;
  createdAt: string;
};

type Props = {
  itemId: string;
};

export default function VideoQuizPanel({ itemId }: Props) {
  const [status, setStatus] = useState("NONE");
  const [title, setTitle] = useState("Lecture quiz");
  const [questions, setQuestions] = useState<QuizChoiceView[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [bestPercent, setBestPercent] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [result, setResult] = useState<{
    score: number;
    maxScore: number;
    percent: number;
    xpAwarded: number;
    totalXp: number;
    level: number;
    details: Array<{
      id: string;
      correct: boolean;
      correctIndex: number;
      selected: number;
      explanation: string;
    }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/videos/${encodeURIComponent(itemId)}/quiz`);
        const json = (await response.json()) as {
          quizStatus?: string;
          quiz?: { title: string; questions: QuizChoiceView[] } | null;
          attempts?: Attempt[];
          bestPercent?: number;
          message?: string;
        };
        if (!response.ok) throw new Error(json.message || "Failed to load quiz");
        if (cancelled) return;
        setStatus(json.quizStatus || "NONE");
        setTitle(json.quiz?.title || "Lecture quiz");
        setQuestions(json.quiz?.questions || []);
        setAttempts(json.attempts || []);
        setBestPercent(json.bestPercent || 0);
        setAnswers({});
        setResult(null);
        setQIndex(0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load quiz");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/videos/${encodeURIComponent(itemId)}/quiz/attempt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers }),
          },
        );
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || "Submit failed");
        setResult(json);
        setBestPercent((prev) => Math.max(prev, json.percent || 0));
        setAttempts((prev) => [
          {
            id: json.attemptId,
            score: json.score,
            maxScore: json.maxScore,
            percent: json.percent,
            xpAwarded: json.xpAwarded,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submit failed");
      }
    });
  }

  const current = questions[qIndex];
  const ready = status === "READY" && questions.length > 0;

  return (
    <section className="notes-shell">
      <div className="notes-toolbar">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="notes-toolbar-title">{title}</h2>
            <span
              className={`notes-status-pill ${
                ready
                  ? "notes-status-ready"
                  : status === "PENDING"
                    ? "notes-status-busy"
                    : status === "FAILED"
                      ? "notes-status-failed"
                      : "notes-status-idle"
              }`}
            >
              {ready ? "Ready" : status === "PENDING" ? "Preparing" : status}
            </span>
          </div>
          <p className="notes-toolbar-copy">
            {ready
              ? `Best score ${bestPercent}% · Earn XP for each attempt`
              : "Quiz is generated automatically after notes are ready."}
          </p>
        </div>
      </div>

      {error && <p className="notes-error">{error}</p>}

      {!ready && (
        <div className="notes-empty">
          <h3>Quiz coming soon</h3>
          <p>Once lecture notes are ready, the agent builds a topic-covering quiz here.</p>
        </div>
      )}

      {ready && !result && current && (
        <div className="notes-article space-y-4">
          <p className="text-sm text-[var(--yt-muted)]">
            Question {qIndex + 1} of {questions.length}
            {current.topic ? ` · ${current.topic}` : ""}
          </p>
          <h3 className="text-lg font-semibold leading-snug">{current.prompt}</h3>
          <div className="grid gap-2">
            {current.choices.map((choice, index) => {
              const selected = answers[current.id] === index;
              return (
                <button
                  key={index}
                  type="button"
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                    selected
                      ? "border-[#0284c7] bg-[#e0f2fe]"
                      : "border-[var(--yt-border)] bg-white hover:bg-[#f8fafc]"
                  }`}
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [current.id]: index }))
                  }
                >
                  <span className="mr-2 font-semibold text-[#0284c7]">
                    {String.fromCharCode(65 + index)}.
                  </span>
                  {choice}
                </button>
              );
            })}
          </div>
          <div className="notes-pager">
            <button
              type="button"
              className="notes-btn notes-btn-ghost"
              disabled={qIndex <= 0}
              onClick={() => setQIndex((v) => Math.max(0, v - 1))}
            >
              Previous
            </button>
            {qIndex < questions.length - 1 ? (
              <button
                type="button"
                className="notes-btn notes-btn-primary"
                onClick={() => setQIndex((v) => Math.min(questions.length - 1, v + 1))}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="notes-btn notes-btn-primary"
                disabled={isPending || Object.keys(answers).length < questions.length}
                onClick={submit}
              >
                {isPending ? "Scoring…" : "Submit quiz"}
              </button>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="notes-article space-y-4">
          <div className="notes-takeaways">
            <h3 className="notes-section-title">Results</h3>
            <p className="text-2xl font-semibold">
              {result.score}/{result.maxScore} · {result.percent}%
            </p>
            <p className="mt-1 text-sm text-[var(--yt-muted)]">
              +{result.xpAwarded} XP · Level {result.level} · Total {result.totalXp} XP
            </p>
          </div>
          <div className="space-y-3">
            {result.details.map((detail, index) => {
              const question = questions.find((q) => q.id === detail.id);
              return (
                <div
                  key={detail.id}
                  className={`rounded-xl border p-3 ${
                    detail.correct ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
                  }`}
                >
                  <p className="text-sm font-semibold">
                    Q{index + 1}. {question?.prompt}
                  </p>
                  <p className="mt-1 text-sm">
                    {detail.correct ? "Correct" : "Incorrect"}
                    {!detail.correct && question
                      ? ` · Answer: ${question.choices[detail.correctIndex]}`
                      : ""}
                  </p>
                  {detail.explanation && (
                    <p className="mt-1 text-sm text-[var(--yt-muted)]">{detail.explanation}</p>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="notes-btn notes-btn-ghost"
            onClick={() => {
              setResult(null);
              setAnswers({});
              setQIndex(0);
            }}
          >
            Retake quiz
          </button>
        </div>
      )}

      {attempts.length > 0 && !result && (
        <div className="border-t border-[#eef1f6] px-4 py-3 text-xs text-[var(--yt-muted)]">
          Recent attempts:{" "}
          {attempts
            .slice(0, 3)
            .map((a) => `${a.percent}% (+${a.xpAwarded} XP)`)
            .join(" · ")}
        </div>
      )}
    </section>
  );
}
