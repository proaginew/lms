"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

type Stats = {
  notes: Record<string, number>;
  quiz: Record<string, number>;
};

type Row = {
  itemId: string;
  title: string | null;
  fileName: string;
  courseFolderId: string;
  notesStatus: string;
  quizStatus: string;
  notesError: string | null;
  quizError: string | null;
  updatedAt: string;
};

const PAGE_SIZE = 20;

export default function ContentAgentAdmin({
  initialStats,
  initialRows,
  total,
  sync,
}: {
  initialStats: Stats;
  initialRows: Row[];
  total: number;
  sync: {
    graphSubscriptionId: string | null;
    subscriptionExpiresAt: string | null;
    lastWebhookAt: string | null;
    lastDiscoverAt: string | null;
    ingestMode: "webhook" | "cron-poller";
    ingestReason: string;
  };
}) {
  const [stats, setStats] = useState(initialStats);
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visible = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function runAgent(extra: Record<string, boolean> = {}) {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/cron/content-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discover: true, ...extra }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || "Agent failed");
        setMessage(
          json.processed
            ? `Processed ${json.processed.kind} for ${json.processed.itemId}`
            : "Queue empty after discover",
        );
        window.location.reload();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Agent failed");
      }
    });
  }

  useEffect(() => {
    setRows(initialRows);
    setStats(initialStats);
  }, [initialRows, initialStats]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">Content agent</h2>
          <p className="yt-meta mt-1">
            Prefers Graph webhooks; if webhooks are missing or stale, the cron poller scans
            OneDrive every few minutes and processes the queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="notes-btn notes-btn-primary"
            disabled={isPending}
            onClick={() => runAgent({ forcePoll: true })}
          >
            {isPending ? "Running…" : "Run poller now"}
          </button>
          <button
            type="button"
            className="notes-btn notes-btn-ghost"
            disabled={isPending}
            onClick={() => runAgent({ ensureSubscription: true, forcePoll: true })}
          >
            Ensure webhook
          </button>
        </div>
      </div>

      {message && <p className="notes-error !bg-[#eff6ff] !text-[#1d4ed8]">{message}</p>}

      <div
        className={`yt-card p-4 text-sm space-y-1 border ${
          sync.ingestMode === "cron-poller" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <p className="font-semibold text-[var(--yt-ink)]">
          Ingest mode: {sync.ingestMode === "cron-poller" ? "Cron poller (fallback)" : "Webhook"}
        </p>
        <p className="text-[var(--yt-muted)]">{sync.ingestReason}</p>
        <p className="text-[var(--yt-muted)]">
          Webhook subscription:{" "}
          <span className="font-medium text-[var(--yt-ink)]">
            {sync.graphSubscriptionId || "Not registered"}
          </span>
        </p>
        <p className="text-[var(--yt-muted)]">Expires: {sync.subscriptionExpiresAt || "—"}</p>
        <p className="text-[var(--yt-muted)]">Last webhook: {sync.lastWebhookAt || "—"}</p>
        <p className="text-[var(--yt-muted)]">Last poll/discover: {sync.lastDiscoverAt || "—"}</p>
      </div>

      <div className="yt-grid-stats yt-grid-stats-4">
        {(
          [
            ["Notes ready", stats.notes.READY, "yt-accent-4"],
            ["Notes pending", stats.notes.PENDING + stats.notes.NONE, "yt-accent-3"],
            ["Quiz ready", stats.quiz.READY, "yt-accent-1"],
            ["Failed", stats.notes.FAILED + stats.quiz.FAILED, "yt-accent-0"],
          ] as const
        ).map(([label, value, accent]) => (
          <div key={label} className={`yt-stat-card ${accent}`}>
            <p className="yt-meta">{label}</p>
            <p className="mt-2 text-2xl font-semibold sm:text-3xl">{value}</p>
          </div>
        ))}
      </div>

      <div className="yt-card yt-table-scroll overflow-x-auto">
        <table className="yt-table">
          <thead>
            <tr>
              <th>Video</th>
              <th>Notes</th>
              <th>Quiz</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.itemId}>
                <td>
                  <p className="font-medium">{row.title || row.fileName}</p>
                  {(row.notesError || row.quizError) && (
                    <p className="text-xs text-rose-600">
                      {row.notesError || row.quizError}
                    </p>
                  )}
                </td>
                <td>
                  <span className="yt-badge yt-badge-accent">{row.notesStatus}</span>
                </td>
                <td>
                  <span className="yt-badge yt-badge-accent">{row.quizStatus}</span>
                </td>
                <td className="text-xs text-[var(--yt-muted)]">
                  {new Date(row.updatedAt).toLocaleString()}
                </td>
                <td>
                  <Link
                    href={`/courses/${encodeURIComponent(row.courseFolderId)}/watch/${encodeURIComponent(row.itemId)}`}
                    className="text-sm text-[#0284c7] hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="notes-pager">
        <button
          type="button"
          className="notes-btn notes-btn-ghost"
          disabled={page <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </button>
        <span className="notes-pager-meta">
          Page {page + 1} of {pageCount}
        </span>
        <button
          type="button"
          className="notes-btn notes-btn-ghost"
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
