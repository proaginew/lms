"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import NotesCodeEditor, { looksLikeCode } from "@/components/NotesCodeEditor";
import type { TopicNotes, VideoNotesContent, VideoNotesView } from "@/lib/videoNotes";

type Props = {
  courseFolderId: string;
  courseName: string;
  itemId: string;
  videoTitle: string;
  topic: string | null;
  meetingDate: string | null;
  initialNotes: VideoNotesView | null;
  isAdmin: boolean;
};

type NotesPage =
  | {
      kind: "intro";
      overview: string;
      learningObjectives: string[];
      keyTakeaways: string[];
    }
  | { kind: "topic"; topic: TopicNotes }
  | {
      kind: "closing";
      glossary: VideoNotesContent["glossary"];
      questionsAndAnswers: VideoNotesContent["questionsAndAnswers"];
      timestampIndex: VideoNotesContent["timestampIndex"];
      actionItems: string[];
      references: string[];
    };

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={index} className="notes-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function splitProseAndCode(text: string): Array<{ kind: "prose" | "code"; value: string }> {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks: Array<{ kind: "prose" | "code"; value: string }> = [];
  const fenceRe = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(normalized))) {
    const before = normalized.slice(last, match.index).trim();
    if (before) blocks.push({ kind: "prose", value: before });
    const lang = match[1] ? `${match[1]}:\n` : "";
    blocks.push({ kind: "code", value: `${lang}${match[2]}`.trimEnd() });
    last = match.index + match[0].length;
  }
  const rest = normalized.slice(last).trim();
  if (rest) {
    for (const para of rest.split(/\n\n+/)) {
      if (looksLikeCode(para)) blocks.push({ kind: "code", value: para });
      else blocks.push({ kind: "prose", value: para });
    }
  }
  return blocks;
}

function Paragraphs({ text }: { text: string }) {
  const blocks = splitProseAndCode(text);
  return (
    <>
      {blocks.map((block, index) =>
        block.kind === "code" ? (
          <NotesCodeEditor key={index} code={block.value} />
        ) : (
          <p key={index} className="notes-prose-p">
            {renderInline(block.value.replace(/\n/g, " "))}
          </p>
        ),
      )}
    </>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="notes-bullet-list">
      {items.map((item, index) =>
        looksLikeCode(item) ? (
          <li key={index} className="list-none -ml-[1.15rem]">
            <NotesCodeEditor code={item} />
          </li>
        ) : (
          <li key={index}>{renderInline(item)}</li>
        ),
      )}
    </ul>
  );
}

function NumberedList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ol className="notes-bullet-list list-decimal pl-5">
      {items.map((item, index) =>
        looksLikeCode(item) ? (
          <li key={index} className="list-none">
            <NotesCodeEditor code={item} />
          </li>
        ) : (
          <li key={index}>{renderInline(item)}</li>
        ),
      )}
    </ol>
  );
}

function CodeBlocks({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="notes-code-stack">
      {items.map((item, index) => (
        <NotesCodeEditor key={index} code={item} />
      ))}
    </div>
  );
}

function TopicBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold text-[var(--yt-ink)]">{title}</h4>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function buildPages(notes: VideoNotesContent): NotesPage[] {
  const topics =
    notes.topics.length > 0
      ? notes.topics
      : notes.sections.map((section) => ({
          name: section.heading,
          timestamp: null,
          explanation: section.body,
          importantPoints: section.bullets ?? [],
          steps: [],
          commandsCode: [],
          examples: [],
          bestPractices: [],
          commonMistakes: [],
          notes: [],
        }));

  const pages: NotesPage[] = [
    {
      kind: "intro",
      overview: notes.overview || notes.summary,
      learningObjectives: notes.learningObjectives,
      keyTakeaways: notes.keyTakeaways,
    },
  ];

  for (const topic of topics) {
    pages.push({ kind: "topic", topic });
  }

  if (
    notes.glossary.length ||
    notes.questionsAndAnswers.length ||
    notes.timestampIndex.length ||
    notes.actionItems.length ||
    notes.studyTips.length ||
    notes.references.length
  ) {
    pages.push({
      kind: "closing",
      glossary: notes.glossary,
      questionsAndAnswers: notes.questionsAndAnswers,
      timestampIndex: notes.timestampIndex,
      actionItems: notes.actionItems.length ? notes.actionItems : notes.studyTips,
      references: notes.references,
    });
  }

  return pages;
}

export default function VideoNotesPanel({
  courseFolderId,
  courseName,
  itemId,
  videoTitle,
  topic,
  meetingDate,
  initialNotes,
  isAdmin,
}: Props) {
  const [data, setData] = useState<VideoNotesView | null>(initialNotes);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setData(initialNotes);
    setError(null);
    setPageIndex(0);
    setEditing(false);
  }, [initialNotes, itemId]);

  // Poll while notes are still preparing (queued on course/watch open).
  useEffect(() => {
    const status = data?.notesStatus ?? "NONE";
    if (status !== "PENDING" && status !== "NONE") return;
    const id = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/videos/${encodeURIComponent(itemId)}/notes`);
        if (!response.ok) return;
        const json = (await response.json()) as VideoNotesView;
        setData(json);
      } catch {
        // ignore transient poll errors
      }
    }, 8000);
    return () => window.clearInterval(id);
  }, [data?.notesStatus, itemId]);

  const status = data?.notesStatus ?? "NONE";
  const notes = data?.notes ?? null;
  const ready = status === "READY" && Boolean(notes);
  const pages = useMemo(() => (notes ? buildPages(notes) : []), [notes]);
  const page = pages[pageIndex] ?? null;

  useEffect(() => {
    setPageIndex(0);
  }, [notes?.headline, notes?.topics?.length, notes?.sections?.length]);

  function regenerate() {
    if (!isAdmin) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/videos/${encodeURIComponent(itemId)}/notes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseFolderId, force: true }),
          },
        );
        const json = (await response.json()) as VideoNotesView & { message?: string };
        if (!response.ok) throw new Error(json.message || "Could not regenerate notes");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not regenerate notes");
      }
    });
  }

  function startEdit() {
    if (!notes) return;
    setDraft(JSON.stringify(notes, null, 2));
    setEditing(true);
  }

  function saveEdit() {
    setError(null);
    startTransition(async () => {
      try {
        const parsed = JSON.parse(draft) as VideoNotesContent;
        const response = await fetch(
          `/api/admin/videos/${encodeURIComponent(itemId)}/notes`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: parsed }),
          },
        );
        const json = (await response.json()) as {
          notes?: VideoNotesContent;
          notesStatus?: string;
          message?: string;
        };
        if (!response.ok) throw new Error(json.message || "Save failed");
        setData((prev) =>
          prev
            ? {
                ...prev,
                notes: json.notes ?? parsed,
                notesStatus: json.notesStatus || "READY",
              }
            : prev,
        );
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  async function download(format: "pdf" | "docx") {
    setDownloading(format);
    setError(null);
    try {
      const response = await fetch(
        `/api/videos/${encodeURIComponent(itemId)}/notes/export?format=${format}`,
      );
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message || "Download failed");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `training-notes.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  const meta = [courseName, topic, formatDate(meetingDate)].filter(Boolean).join(" · ");

  return (
    <section className="notes-shell" aria-labelledby="study-notes-heading">
      <div className="notes-toolbar">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="study-notes-heading" className="notes-toolbar-title">
              Lecture notes
            </h2>
            <span
              className={`notes-status-pill ${
                ready
                  ? "notes-status-ready"
                  : status === "FAILED"
                    ? "notes-status-failed"
                    : status === "PENDING"
                      ? "notes-status-busy"
                      : "notes-status-idle"
              }`}
            >
              {ready
                ? "Ready"
                : status === "PENDING"
                  ? "Preparing"
                  : status === "FAILED"
                    ? "Failed"
                    : "Queued"}
            </span>
          </div>
          <p className="notes-toolbar-copy">
            {ready
              ? "Transcript-based training notes for this lecture."
              : status === "PENDING"
                ? "Generating professional training notes from the transcript…"
                : status === "FAILED"
                  ? data?.notesError || "Notes generation failed."
                  : "Opening this course queues notes and quiz generation automatically."}
          </p>
        </div>

        <div className="notes-actions">
          {ready && notes && (
            <>
              <button
                type="button"
                className="notes-btn notes-btn-pdf"
                disabled={Boolean(downloading)}
                onClick={() => void download("pdf")}
              >
                {downloading === "pdf" ? "Preparing PDF…" : "Download PDF"}
              </button>
              <button
                type="button"
                className="notes-btn notes-btn-word"
                disabled={Boolean(downloading)}
                onClick={() => void download("docx")}
              >
                {downloading === "docx" ? "Preparing Word…" : "Download Word"}
              </button>
              {isAdmin && (
                <>
                  <button type="button" className="notes-btn notes-btn-ghost" onClick={startEdit}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="notes-btn notes-btn-ghost"
                    disabled={isPending}
                    onClick={regenerate}
                  >
                    {isPending ? "Generating…" : "Regenerate notes"}
                  </button>
                </>
              )}
            </>
          )}
          {isAdmin && !ready && (
            <button
              type="button"
              className="notes-btn notes-btn-primary"
              disabled={isPending}
              onClick={regenerate}
            >
              {isPending ? "Generating notes…" : "Generate notes"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="notes-error">{error}</p>}

      {editing && (
        <div className="space-y-3 p-4">
          <textarea
            className="min-h-[320px] w-full rounded-xl border border-[var(--yt-border)] p-3 font-mono text-xs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" className="notes-btn notes-btn-primary" onClick={saveEdit}>
              Save to database
            </button>
            <button
              type="button"
              className="notes-btn notes-btn-ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editing && ready && notes && page && (
        <div className="notes-article">
          <header className="notes-article-header">
            <p className="notes-kicker">Training notes</p>
            <h2 className="notes-headline">{notes.headline}</h2>
            {meta && <p className="notes-byline">{meta}</p>}
          </header>

          {page.kind === "intro" && (
            <>
              {page.overview && (
                <section className="notes-section">
                  <h3 className="notes-section-title">Overview</h3>
                  <Paragraphs text={page.overview} />
                </section>
              )}
              {page.learningObjectives.length > 0 && (
                <section className="notes-section">
                  <h3 className="notes-section-title">Learning Objectives</h3>
                  <BulletList items={page.learningObjectives} />
                </section>
              )}
              {page.keyTakeaways.length > 0 && (
                <section className="notes-section notes-takeaways">
                  <h3 className="notes-section-title">Key Takeaways</h3>
                  <ol className="notes-takeaway-list">
                    {page.keyTakeaways.map((item, index) => (
                      <li key={index}>
                        <span className="notes-takeaway-index">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>{renderInline(item)}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}

          {page.kind === "topic" && (
            <section className="notes-section">
              <h3 className="notes-section-title">
                {page.topic.name}
                {page.topic.timestamp ? (
                  <span className="ml-2 text-sm font-normal text-[var(--yt-muted)]">
                    {page.topic.timestamp}
                  </span>
                ) : null}
              </h3>
              {page.topic.explanation && (
                <TopicBlock title="Explanation">
                  <Paragraphs text={page.topic.explanation} />
                </TopicBlock>
              )}
              {page.topic.importantPoints.length > 0 && (
                <TopicBlock title="Important Points">
                  <BulletList items={page.topic.importantPoints} />
                </TopicBlock>
              )}
              {page.topic.steps.length > 0 && (
                <TopicBlock title="Steps or Process">
                  <NumberedList items={page.topic.steps} />
                </TopicBlock>
              )}
              {page.topic.commandsCode.length > 0 && (
                <TopicBlock title="Commands / Code">
                  <CodeBlocks items={page.topic.commandsCode} />
                </TopicBlock>
              )}
              {page.topic.examples.length > 0 && (
                <TopicBlock title="Examples Mentioned">
                  <BulletList items={page.topic.examples} />
                </TopicBlock>
              )}
              {page.topic.bestPractices.length > 0 && (
                <TopicBlock title="Best Practices">
                  <BulletList items={page.topic.bestPractices} />
                </TopicBlock>
              )}
              {page.topic.commonMistakes.length > 0 && (
                <TopicBlock title="Common Mistakes">
                  <BulletList items={page.topic.commonMistakes} />
                </TopicBlock>
              )}
              {page.topic.notes.length > 0 && (
                <TopicBlock title="Notes">
                  <BulletList items={page.topic.notes} />
                </TopicBlock>
              )}
            </section>
          )}

          {page.kind === "closing" && (
            <>
              {page.glossary.length > 0 && (
                <section className="notes-section">
                  <h3 className="notes-section-title">Definitions</h3>
                  <dl className="notes-glossary">
                    {page.glossary.map((item) => (
                      <div key={item.term} className="notes-glossary-row">
                        <dt>{renderInline(item.term)}</dt>
                        <dd>
                          {looksLikeCode(item.definition) ? (
                            <NotesCodeEditor code={item.definition} />
                          ) : (
                            renderInline(item.definition)
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {page.questionsAndAnswers.length > 0 && (
                <section className="notes-section">
                  <h3 className="notes-section-title">Questions and Answers</h3>
                  <div className="overflow-x-auto">
                    <table className="yt-table">
                      <thead>
                        <tr>
                          <th>Question</th>
                          <th>Answer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.questionsAndAnswers.map((item, index) => (
                          <tr key={index}>
                            <td>{renderInline(item.question)}</td>
                            <td>
                              {looksLikeCode(item.answer) ? (
                                <NotesCodeEditor code={item.answer} />
                              ) : (
                                renderInline(item.answer)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {page.timestampIndex.length > 0 && (
                <section className="notes-section">
                  <h3 className="notes-section-title">Timestamp Index</h3>
                  <div className="overflow-x-auto">
                    <table className="yt-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Topic</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.timestampIndex.map((item, index) => (
                          <tr key={index}>
                            <td>{item.timestamp}</td>
                            <td>{item.topic}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {page.actionItems.length > 0 && (
                <section className="notes-section notes-tips">
                  <h3 className="notes-section-title">Action Items</h3>
                  <BulletList items={page.actionItems} />
                </section>
              )}
              {page.references.length > 0 && (
                <section className="notes-section">
                  <h3 className="notes-section-title">References</h3>
                  <BulletList items={page.references} />
                </section>
              )}
            </>
          )}

          {pages.length > 1 && (
            <div className="notes-pager">
              <button
                type="button"
                className="notes-btn notes-btn-ghost"
                disabled={pageIndex <= 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span className="notes-pager-meta">
                Page {pageIndex + 1} of {pages.length}
              </span>
              <button
                type="button"
                className="notes-btn notes-btn-ghost"
                disabled={pageIndex >= pages.length - 1}
                onClick={() => setPageIndex((p) => Math.min(pages.length - 1, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {!editing && !ready && (
        <div className="notes-empty">
          <div className="notes-empty-mark" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M7 3.5h7.5L19 8v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path d="M14.5 3.5V8H19" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M8.5 12h7M8.5 15.5h7M8.5 19h4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h3>Notes are being prepared</h3>
          <p>
            Opening this course queues transcript-based training notes and a quiz for{" "}
            <span className="font-medium text-[var(--yt-ink)]">{videoTitle}</span>. This
            page refreshes automatically when they are ready.
          </p>
        </div>
      )}
    </section>
  );
}
