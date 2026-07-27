"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import ProctoredVideoPlayer from "@/components/ProctoredVideoPlayer";
import VideoNotesPanel from "@/components/VideoNotesPanel";
import VideoQuizPanel from "@/components/VideoQuizPanel";
import type { VideoNotesView } from "@/lib/videoNotes";

export type WatchPlaylistItem = {
  id: string;
  title: string;
  topic: string | null;
  meetingDate: string | null;
  thumbnailUrl: string;
};

type Props = {
  courseFolderId: string;
  courseName: string;
  currentId: string;
  currentTitle: string;
  currentTopic: string | null;
  currentMeetingDate: string | null;
  playlist: WatchPlaylistItem[];
  initialNotes: VideoNotesView | null;
  isAdmin: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WatchTheater({
  courseFolderId,
  courseName,
  currentId,
  currentTitle,
  currentTopic,
  currentMeetingDate,
  playlist,
  initialNotes,
  isAdmin,
}: Props) {
  const currentIndex = playlist.findIndex((item) => item.id === currentId);
  const next = currentIndex >= 0 ? playlist[currentIndex + 1] : null;
  const [autoplayHint, setAutoplayHint] = useState(true);
  const [studyTab, setStudyTab] = useState<"notes" | "quiz">("notes");

  return (
    <div className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_402px]">
        <div className="min-w-0 space-y-3">
          <ProctoredVideoPlayer courseFolderId={courseFolderId} itemId={currentId} />

          <div className="space-y-2 px-0.5">
            <h1 className="text-xl font-semibold leading-snug sm:text-2xl">{currentTitle}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--yt-muted)]">
              {currentTopic && <span>{currentTopic}</span>}
              {currentTopic && currentMeetingDate && <span>·</span>}
              <span>{formatDate(currentMeetingDate)}</span>
              <span>·</span>
              <Link
                href={`/courses/${encodeURIComponent(courseFolderId)}`}
                className="hover:text-[var(--yt-ink)] hover:underline"
              >
                {courseName}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {next && (
                <Link
                  href={`/courses/${encodeURIComponent(courseFolderId)}/watch/${encodeURIComponent(next.id)}`}
                  className="yt-btn-ghost"
                >
                  Next: {next.title}
                </Link>
              )}
            </div>
          </div>

          <div className="study-tabs" role="tablist" aria-label="Study materials">
            <button
              type="button"
              role="tab"
              aria-selected={studyTab === "notes"}
              className={`study-tab ${studyTab === "notes" ? "study-tab-active" : ""}`}
              onClick={() => setStudyTab("notes")}
            >
              Lecture notes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studyTab === "quiz"}
              className={`study-tab ${studyTab === "quiz" ? "study-tab-active" : ""}`}
              onClick={() => setStudyTab("quiz")}
            >
              Quiz
            </button>
          </div>

          {studyTab === "notes" ? (
            <VideoNotesPanel
              courseFolderId={courseFolderId}
              courseName={courseName}
              itemId={currentId}
              videoTitle={currentTitle}
              topic={currentTopic}
              meetingDate={currentMeetingDate}
              initialNotes={initialNotes}
              isAdmin={isAdmin}
            />
          ) : (
            <VideoQuizPanel itemId={currentId} />
          )}
        </div>

        <aside className="lg:sticky lg:top-[7.5rem] lg:self-start">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Up next</h2>
              <p className="yt-meta">{playlist.length} in this course</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--yt-muted)]">
              Autoplays
              <button
                type="button"
                role="switch"
                aria-checked={autoplayHint}
                onClick={() => setAutoplayHint((value) => !value)}
                className={`relative h-5 w-9 rounded-full transition ${
                  autoplayHint ? "bg-[var(--yt-red)]" : "bg-[#ccc]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                    autoplayHint ? "left-4" : "left-0.5"
                  }`}
                />
              </button>
            </label>
          </div>

          <div className="max-h-[75vh] space-y-2 overflow-y-auto pr-1">
            {playlist.map((item, index) => {
              const active = item.id === currentId;
              const href = `/courses/${encodeURIComponent(courseFolderId)}/watch/${encodeURIComponent(item.id)}`;
              const row = (
                <>
                  <div className="relative h-[94px] w-[168px] shrink-0 overflow-hidden rounded-[8px] bg-black">
                    <Image
                      src={item.thumbnailUrl}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="168px"
                      unoptimized
                    />
                    {active && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-semibold text-white">
                        Now playing
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--yt-ink)]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--yt-muted)]">
                      {[item.topic || courseName, formatDate(item.meetingDate)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--yt-muted)]">{index + 1}</p>
                  </div>
                </>
              );

              if (active) {
                return (
                  <div key={item.id} className="flex gap-2 rounded-lg bg-[#f2f2f2] p-1.5">
                    {row}
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={href}
                  className="flex gap-2 rounded-lg p-1.5 hover:bg-[#f2f2f2]"
                  onClick={(event) => {
                    if (autoplayHint && next && item.id === next.id) {
                      // keep normal navigation; toggle is visual preference only
                    }
                    void event;
                  }}
                >
                  {row}
                </Link>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
