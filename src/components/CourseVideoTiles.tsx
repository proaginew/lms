"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export type VideoTile = {
  id: string;
  fileName: string;
  title: string;
  topic: string | null;
  meetingDate: string | null;
  thumbnailUrl: string;
  status: string;
};

type Props = {
  courseFolderId: string;
  initialVideos: VideoTile[];
  canEnrich: boolean;
  isAdmin: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CourseVideoTiles({
  courseFolderId,
  initialVideos,
  canEnrich,
  isAdmin,
}: Props) {
  const searchParams = useSearchParams();
  const urlQuery = (searchParams.get("q") ?? "").trim().toLowerCase();
  const [videos, setVideos] = useState(initialVideos);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTopic, setDraftTopic] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const video of videos) {
      if (video.topic?.trim()) set.add(video.topic.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [videos]);

  const missingCount = useMemo(
    () => videos.filter((video) => video.status === "PENDING").length,
    [videos],
  );

  const search = (localSearch || urlQuery).trim().toLowerCase();

  const filtered = useMemo(() => {
    return videos.filter((video) => {
      if (topicFilter !== "all" && (video.topic ?? "") !== topicFilter) {
        return false;
      }
      if (dateFrom && (!video.meetingDate || video.meetingDate < dateFrom)) {
        return false;
      }
      if (dateTo && (!video.meetingDate || video.meetingDate > dateTo)) {
        return false;
      }
      if (search) {
        const hay = `${video.title} ${video.topic ?? ""} ${video.fileName}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }, [videos, topicFilter, dateFrom, dateTo, search]);

  async function enrich(force = false) {
    setEnriching(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseFolderId)}/enrich-titles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force, onlyMissing: !force }),
        },
      );
      const data = (await response.json()) as {
        titles?: Array<{
          itemId: string;
          title: string;
          topic: string | null;
          meetingDate: string | null;
          thumbnailUrl?: string | null;
          status: string;
          fileName: string;
        }>;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to generate meeting titles");
      }
      const byId = new Map((data.titles ?? []).map((row) => [row.itemId, row]));
      setVideos((prev) =>
        prev.map((video) => {
          const next = byId.get(video.id);
          if (!next) return video;
          return {
            ...video,
            title: next.title,
            topic: next.topic,
            meetingDate: next.meetingDate,
            thumbnailUrl: next.thumbnailUrl || video.thumbnailUrl,
            status: next.status,
            fileName: next.fileName,
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate meeting titles");
    } finally {
      setEnriching(false);
    }
  }

  function startEdit(video: VideoTile) {
    setEditingId(video.id);
    setDraftTitle(video.title);
    setDraftTopic(video.topic ?? "");
    setError(null);
  }

  async function saveEdit(videoId: string) {
    const title = draftTitle.trim();
    if (!title) {
      setError("Title is required");
      return;
    }
    setSavingId(videoId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/videos/${encodeURIComponent(videoId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          topic: draftTopic.trim() || null,
          courseFolderId,
          fileName: videos.find((video) => video.id === videoId)?.fileName,
        }),
      });
      const data = (await response.json()) as {
        title?: string;
        topic?: string | null;
        thumbnailUrl?: string | null;
        meetingDate?: string | null;
        status?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to save title");
      }
      setVideos((prev) =>
        prev.map((video) =>
          video.id === videoId
            ? {
                ...video,
                title: data.title ?? title,
                topic: data.topic ?? null,
                thumbnailUrl: data.thumbnailUrl || video.thumbnailUrl,
                meetingDate: data.meetingDate ?? video.meetingDate,
                status: data.status ?? "READY",
              }
            : video,
        ),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save title");
    } finally {
      setSavingId(null);
    }
  }

  if (videos.length === 0) {
    return (
      <div className="yt-card p-8 text-sm text-[var(--yt-muted)]">
        No meeting recordings in this course yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className={`yt-chip ${topicFilter === "all" ? "yt-chip-active" : ""}`}
          onClick={() => setTopicFilter("all")}
        >
          All
        </button>
        {topics.map((topic) => (
          <button
            key={topic}
            type="button"
            className={`yt-chip ${topicFilter === topic ? "yt-chip-active" : ""}`}
            onClick={() => setTopicFilter(topic)}
          >
            {topic}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--yt-muted)]">
          Search in course
          <input
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Title or topic"
            className="mt-1 block h-9 w-48 rounded-full border border-[#ccc] bg-white px-3 text-sm text-[var(--yt-ink)] outline-none focus:border-[#1c62b9] sm:w-64"
          />
        </label>
        <label className="text-xs text-[var(--yt-muted)]">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="mt-1 block h-9 rounded-lg border border-[#ccc] bg-white px-2 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--yt-muted)]">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="mt-1 block h-9 rounded-lg border border-[#ccc] bg-white px-2 text-sm"
          />
        </label>
        <button
          type="button"
          className="yt-btn-ghost"
          onClick={() => {
            setTopicFilter("all");
            setDateFrom("");
            setDateTo("");
            setLocalSearch("");
          }}
        >
          Clear
        </button>
        {canEnrich && missingCount > 0 && (
          <button
            type="button"
            onClick={() => void enrich(false)}
            disabled={enriching}
            className="yt-btn-primary disabled:opacity-60"
          >
            {enriching ? "Saving…" : `Generate ${missingCount}`}
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => void enrich(true)}
            disabled={enriching}
            className="yt-btn-ghost disabled:opacity-60"
          >
            {enriching ? "Working…" : "Regenerate all"}
          </button>
        )}
      </div>

      <p className="yt-meta">
        Showing {filtered.length} of {videos.length}
        {missingCount > 0 ? ` · ${missingCount} need titles` : ""}
      </p>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="yt-card p-8 text-sm text-[var(--yt-muted)]">
          No videos match these filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((video) => {
            const isEditing = editingId === video.id;
            return (
              <div key={video.id} className="min-w-0">
                <Link
                  href={`/courses/${encodeURIComponent(courseFolderId)}/watch/${encodeURIComponent(video.id)}`}
                  className="yt-thumb group block"
                >
                  <Image
                    src={video.thumbnailUrl}
                    alt={video.title}
                    fill
                    className="object-cover transition duration-200 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 25vw"
                    unoptimized
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white">
                      ▶
                    </span>
                  </span>
                </Link>

                <div className="mt-3 space-y-1 px-0.5">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        className="h-9 w-full rounded-lg border border-[#ccc] px-3 text-sm"
                        placeholder="Meeting title"
                      />
                      <input
                        value={draftTopic}
                        onChange={(event) => setDraftTopic(event.target.value)}
                        className="h-9 w-full rounded-lg border border-[#ccc] px-3 text-sm"
                        placeholder="Topic"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEdit(video.id)}
                          disabled={savingId === video.id}
                          className="yt-btn-primary disabled:opacity-60"
                        >
                          {savingId === video.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="yt-btn-ghost"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/courses/${encodeURIComponent(courseFolderId)}/watch/${encodeURIComponent(video.id)}`}
                        >
                          <h3 className="yt-title hover:underline">{video.title}</h3>
                        </Link>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => startEdit(video)}
                            className="shrink-0 text-xs font-medium text-[var(--yt-muted)] hover:text-[var(--yt-ink)]"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      <p className="yt-meta">
                        {[video.topic, formatDate(video.meetingDate)].filter(Boolean).join(" · ")}
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
