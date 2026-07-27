"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { VideoNotesContent, VideoNotesView } from "@/lib/videoNotes";

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
  | { kind: "intro"; summary: string; keyTakeaways: string[] }
  | { kind: "sections"; sections: VideoNotesContent["sections"] }
  | { kind: "closing"; glossary: VideoNotesContent["glossary"]; studyTips: string[] };

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

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\n+/).map((block, index) => (
        <p key={index} className="notes-prose-p">
          {block.replace(/\n/g, " ")}
        </p>
      ))}
    </>
  );
}

function buildPages(notes: VideoNotesContent): NotesPage[] {
  const pages: NotesPage[] = [
    { kind: "intro", summary: notes.summary, keyTakeaways: notes.keyTakeaways },
  ];
  for (let i = 0; i < notes.sections.length; i += 2) {
    pages.push({ kind: "sections", sections: notes.sections.slice(i, i + 2) });
  }
  if (notes.glossary.length || notes.studyTips.length) {
    pages.push({
      kind: "closing",
      glossary: notes.glossary,
      studyTips: notes.studyTips,
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

  const status = data?.notesStatus ?? "NONE";
  const notes = data?.notes ?? null;
  const ready = status === "READY" && Boolean(notes);
  const pages = useMemo(() => (notes ? buildPages(notes) : []), [notes]);
  const page = pages[pageIndex] ?? null;

  useEffect(() => {
    setPageIndex(0);
  }, [notes?.headline, notes?.sections?.length]);

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
      const filename = match?.[1] || `study-notes.${format}`;
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
              ? "Print-ready study notes from this lecture."
              : status === "PENDING"
                ? "The content agent is writing exhaustive notes from the transcript…"
                : status === "FAILED"
                  ? data?.notesError || "Notes generation failed."
                  : "Notes will appear automatically once the agent processes this video."}
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
        <div className="p-4 space-y-3">
          <textarea
            className="w-full min-h-[320px] rounded-xl border border-[var(--yt-border)] p-3 font-mono text-xs"
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
            <p className="notes-kicker">Study notes</p>
            <h2 className="notes-headline">{notes.headline}</h2>
            {meta && <p className="notes-byline">{meta}</p>}
          </header>

          {page.kind === "intro" && (
            <>
              {page.summary && (
                <section className="notes-section">
                  <h3 className="notes-section-title">Overview</h3>
                  <Paragraphs text={page.summary} />
                </section>
              )}
              {page.keyTakeaways.length > 0 && (
                <section className="notes-section notes-takeaways">
                  <h3 className="notes-section-title">Key takeaways</h3>
                  <ol className="notes-takeaway-list">
                    {page.keyTakeaways.map((item, index) => (
                      <li key={index}>
                        <span className="notes-takeaway-index">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}

          {page.kind === "sections" &&
            page.sections.map((section, index) => (
              <section key={`${section.heading}-${index}`} className="notes-section">
                {section.heading && (
                  <h3 className="notes-section-title">{section.heading}</h3>
                )}
                {section.body && <Paragraphs text={section.body} />}
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="notes-bullet-list">
                    {section.bullets.map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

          {page.kind === "closing" && (
            <>
              {page.glossary.length > 0 && (
                <section className="notes-section">
                  <h3 className="notes-section-title">Glossary</h3>
                  <dl className="notes-glossary">
                    {page.glossary.map((item) => (
                      <div key={item.term} className="notes-glossary-row">
                        <dt>{item.term}</dt>
                        <dd>{item.definition}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {page.studyTips.length > 0 && (
                <section className="notes-section notes-tips">
                  <h3 className="notes-section-title">Study tips</h3>
                  <ul className="notes-bullet-list">
                    {page.studyTips.map((tip, index) => (
                      <li key={index}>{tip}</li>
                    ))}
                  </ul>
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
            Exhaustive study notes for{" "}
            <span className="font-medium text-[var(--yt-ink)]">{videoTitle}</span> are
            generated automatically in the backend after the video is available — then you
            can read, paginate, and download PDF/Word.
          </p>
        </div>
      )}
    </section>
  );
}
