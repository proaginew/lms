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

type AnswerFeedback = {
  selected: number;
  correct: boolean;
  correctIndex: number;
  explanation: string;
};

type Props = {
  itemId: string;
  isAdmin: boolean;
};

export default function VideoQuizPanel({ itemId, isAdmin }: Props) {
  const [status, setStatus] = useState("NONE");
  const [notesStatus, setNotesStatus] = useState("NONE");
  const [title, setTitle] = useState("Lecture quiz");
  const [questions, setQuestions] = useState<QuizChoiceView[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, AnswerFeedback>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
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

  function applyQuizPayload(json: {
    quizStatus?: string;
    notesStatus?: string;
    quiz?: { title: string; questions: QuizChoiceView[] } | null;
    attempts?: Attempt[];
    bestPercent?: number;
  }) {
    setStatus(json.quizStatus || "NONE");
    setNotesStatus(json.notesStatus || "NONE");
    setTitle(json.quiz?.title || "Lecture quiz");
    setQuestions(json.quiz?.questions || []);
    if (json.attempts) setAttempts(json.attempts);
    if (typeof json.bestPercent === "number") setBestPercent(json.bestPercent);
    setAnswers({});
    setFeedback({});
    setCheckingId(null);
    setResult(null);
    setQIndex(0);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/videos/${encodeURIComponent(itemId)}/quiz`);
        const json = (await response.json()) as {
          quizStatus?: string;
          notesStatus?: string;
          quiz?: { title: string; questions: QuizChoiceView[] } | null;
          attempts?: Attempt[];
          bestPercent?: number;
          message?: string;
        };
        if (!response.ok) throw new Error(json.message || "Failed to load quiz");
        if (cancelled) return;
        applyQuizPayload(json);
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

  useEffect(() => {
    if (status === "READY" || status === "FAILED") return;
    const id = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/videos/${encodeURIComponent(itemId)}/quiz`);
        if (!response.ok) return;
        const json = (await response.json()) as {
          quizStatus?: string;
          notesStatus?: string;
          quiz?: { title: string; questions: QuizChoiceView[] } | null;
          attempts?: Attempt[];
          bestPercent?: number;
        };
        applyQuizPayload(json);
      } catch {
        // ignore
      }
    }, 8000);
    return () => window.clearInterval(id);
  }, [itemId, status]);

  function generateQuiz(force = true) {
    if (!isAdmin) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/videos/${encodeURIComponent(itemId)}/quiz`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        const json = (await response.json()) as {
          quizStatus?: string;
          notesStatus?: string;
          quiz?: { title: string; questions: QuizChoiceView[] } | null;
          message?: string;
        };
        if (!response.ok) throw new Error(json.message || "Could not generate quiz");
        applyQuizPayload(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not generate quiz");
      }
    });
  }

  async function checkAnswer(questionId: string, selected: number) {
    if (feedback[questionId] || checkingId) return;
    setError(null);
    setAnswers((prev) => ({ ...prev, [questionId]: selected }));
    setCheckingId(questionId);
    try {
      const response = await fetch(
        `/api/videos/${encodeURIComponent(itemId)}/quiz/check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId, selected }),
        },
      );
      const json = (await response.json()) as AnswerFeedback & {
        questionId?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(json.message || "Could not check answer");
      setFeedback((prev) => ({
        ...prev,
        [questionId]: {
          selected: json.selected,
          correct: json.correct,
          correctIndex: json.correctIndex,
          explanation: json.explanation || "",
        },
      }));
    } catch (err) {
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      setError(err instanceof Error ? err.message : "Could not check answer");
    } finally {
      setCheckingId(null);
    }
  }

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
  const notesReady = notesStatus === "READY";
  const currentFeedback = current ? feedback[current.id] : undefined;
  const allChecked =
    questions.length > 0 && questions.every((q) => Boolean(feedback[q.id]));
  const runningCorrect = Object.values(feedback).filter((f) => f.correct).length;

  return (
    <section className="notes-shell">
      <div className="notes-toolbar">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="notes-toolbar-title">{title}</h2>
            <span
              className={`notes-status-pill ${
                ready
                  ? "notes-status-ready"
                  : status === "PENDING" || isPending
                    ? "notes-status-busy"
                    : status === "FAILED"
                      ? "notes-status-failed"
                      : "notes-status-idle"
              }`}
            >
              {ready
                ? "Ready"
                : isPending
                  ? "Generating"
                  : status === "PENDING"
                    ? "Preparing"
                    : status}
            </span>
          </div>
          <p className="notes-toolbar-copy">
            {ready
              ? `Best score ${bestPercent}% · Instant feedback after each answer · Earn XP on finish`
              : notesReady
                ? "Notes are ready — generate a quiz for this lecture."
                : "Generate lecture notes first, then create the quiz."}
          </p>
        </div>

        {isAdmin && (
          <div className="notes-actions">
            {ready ? (
              <button
                type="button"
                className="notes-btn notes-btn-ghost"
                disabled={isPending}
                onClick={() => generateQuiz(true)}
              >
                {isPending ? "Generating…" : "Regenerate quiz"}
              </button>
            ) : (
              <button
                type="button"
                className="notes-btn notes-btn-primary"
                disabled={isPending || !notesReady}
                onClick={() => generateQuiz(true)}
                title={
                  notesReady
                    ? "Generate quiz from notes"
                    : "Generate lecture notes first"
                }
              >
                {isPending ? "Generating…" : "Generate quiz"}
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="notes-error">{error}</p>}

      {!ready && (
        <div className="notes-empty">
          <h3>{isAdmin ? "Generate a quiz for this video" : "Quiz coming soon"}</h3>
          <p>
            {isAdmin
              ? notesReady
                ? "Click Generate quiz to create exam-style questions from the lecture notes."
                : "Open the Lecture notes tab and generate notes first, then come back here."
              : notesReady
                ? "Quiz generation is queued automatically — this tab refreshes when ready."
                : "Notes are preparing first; the quiz will follow automatically from this lecture."}
          </p>
        </div>
      )}

      {ready && !result && current && (
        <div className="notes-article space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--yt-muted)]">
              Question {qIndex + 1} of {questions.length}
              {current.topic ? ` · ${current.topic}` : ""}
            </p>
            {Object.keys(feedback).length > 0 && (
              <p className="text-sm font-medium text-[#0369a1]">
                So far {runningCorrect}/{Object.keys(feedback).length} correct
              </p>
            )}
          </div>
          <h3 className="text-lg font-semibold leading-snug">{current.prompt}</h3>
          <div className="grid gap-2">
            {current.choices.map((choice, index) => {
              const locked = Boolean(currentFeedback);
              const isSelected = answers[current.id] === index;
              const isCorrectChoice =
                currentFeedback && index === currentFeedback.correctIndex;
              const isWrongSelected =
                currentFeedback &&
                !currentFeedback.correct &&
                index === currentFeedback.selected;

              let choiceClass =
                "border-[var(--yt-border)] bg-white hover:bg-[#f8fafc]";
              if (locked && isCorrectChoice) {
                choiceClass = "border-emerald-400 bg-emerald-50";
              } else if (locked && isWrongSelected) {
                choiceClass = "border-rose-400 bg-rose-50";
              } else if (!locked && isSelected) {
                choiceClass = "border-[#0284c7] bg-[#e0f2fe]";
              }

              return (
                <button
                  key={index}
                  type="button"
                  disabled={locked || checkingId === current.id}
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition disabled:cursor-default ${choiceClass}`}
                  onClick={() => void checkAnswer(current.id, index)}
                >
                  <span className="mr-2 font-semibold text-[#0284c7]">
                    {String.fromCharCode(65 + index)}.
                  </span>
                  {choice}
                  {locked && isCorrectChoice ? (
                    <span className="ml-2 text-xs font-semibold text-emerald-700">
                      Correct
                    </span>
                  ) : null}
                  {locked && isWrongSelected ? (
                    <span className="ml-2 text-xs font-semibold text-rose-700">
                      Your answer
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {checkingId === current.id && (
            <p className="text-sm text-[var(--yt-muted)]">Checking answer…</p>
          )}

          {currentFeedback && (
            <div
              className={`rounded-xl border p-3 ${
                currentFeedback.correct
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-rose-200 bg-rose-50"
              }`}
            >
              <p className="text-sm font-semibold">
                {currentFeedback.correct ? "Correct!" : "Incorrect"}
                {!currentFeedback.correct
                  ? ` · Answer: ${current.choices[currentFeedback.correctIndex]}`
                  : ""}
              </p>
              {currentFeedback.explanation ? (
                <p className="mt-1 text-sm text-[var(--yt-muted)]">
                  {currentFeedback.explanation}
                </p>
              ) : null}
            </div>
          )}

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
                disabled={!currentFeedback}
                onClick={() => setQIndex((v) => Math.min(questions.length - 1, v + 1))}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="notes-btn notes-btn-primary"
                disabled={isPending || !allChecked}
                onClick={submit}
              >
                {isPending ? "Saving…" : "Finish & earn XP"}
              </button>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="notes-article space-y-4">
          <div className="notes-takeaways">
            <h3 className="notes-section-title">Final score</h3>
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
                    detail.correct
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-rose-200 bg-rose-50"
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
              setFeedback({});
              setCheckingId(null);
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
