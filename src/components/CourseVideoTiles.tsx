"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

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
  const [videos, setVideos] = useState(initialVideos);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
      return true;
    });
  }, [videos, topicFilter, dateFrom, dateTo]);

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
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-500">
        No meeting recordings in this course yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-gray-600">
            Topic
            <select
              value={topicFilter}
              onChange={(event) => setTopicFilter(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900"
            >
              <option value="all">All topics</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-600">
            From date
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            To date
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTopicFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
            className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            Clear filters
          </button>
          {canEnrich && missingCount > 0 && (
            <button
              type="button"
              onClick={() => void enrich(false)}
              disabled={enriching}
              className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {enriching ? "Saving…" : `Generate ${missingCount} missing`}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => void enrich(true)}
              disabled={enriching}
              className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {enriching ? "Working…" : "Regenerate all"}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Showing {filtered.length} of {videos.length} meetings
        {missingCount > 0
          ? ` · ${missingCount} need title generation`
          : " · titles loaded from database"}
      </p>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-500">
          No meetings match these filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((video) => {
            const isEditing = editingId === video.id;
            return (
              <div
                key={video.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <Link
                  href={`/courses/${encodeURIComponent(courseFolderId)}/watch/${encodeURIComponent(video.id)}`}
                  className="group relative block aspect-video overflow-hidden bg-slate-800"
                >
                  <Image
                    src={video.thumbnailUrl}
                    alt={video.title}
                    fill
                    className="object-cover transition group-hover:scale-[1.02]"
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/20 transition group-hover:bg-black/30" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-brand-600 shadow">
                      ▶
                    </span>
                  </span>
                  {video.topic && (
                    <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                      {video.topic}
                    </span>
                  )}
                </Link>

                <div className="space-y-2 p-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                        placeholder="Meeting title"
                      />
                      <input
                        value={draftTopic}
                        onChange={(event) => setDraftTopic(event.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                        placeholder="Topic"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEdit(video.id)}
                          disabled={savingId === video.id}
                          className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                        >
                          {savingId === video.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">
                          {video.title}
                        </h3>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => startEdit(video)}
                            className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{formatDate(video.meetingDate)}</p>
                      <p className="truncate text-[11px] text-gray-400">{video.fileName}</p>
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
