"use client";

import Image from "next/image";
import Link from "next/link";
import ProctoredVideoPlayer from "@/components/ProctoredVideoPlayer";

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
  playlist: WatchPlaylistItem[];
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
  playlist,
}: Props) {
  const currentIndex = playlist.findIndex((item) => item.id === currentId);
  const next = currentIndex >= 0 ? playlist[currentIndex + 1] : null;
  const upNext = playlist.filter((item) => item.id !== currentId);

  return (
    <div className="space-y-4">
      <Link
        href={`/courses/${encodeURIComponent(courseFolderId)}`}
        className="text-sm text-brand-600 hover:underline"
      >
        Back to {courseName}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <ProctoredVideoPlayer courseFolderId={courseFolderId} itemId={currentId} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">{currentTitle}</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-sm text-gray-500">
              {currentTopic && <span>{currentTopic}</span>}
              {currentTopic && playlist[currentIndex]?.meetingDate && <span>·</span>}
              <span>{formatDate(playlist[currentIndex]?.meetingDate ?? null)}</span>
            </div>
          </div>
          {next && (
            <Link
              href={`/courses/${encodeURIComponent(courseFolderId)}/watch/${encodeURIComponent(next.id)}`}
              className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next: {next.title}
            </Link>
          )}
        </div>

        <aside className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Up next</h2>
            <p className="text-xs text-gray-500">{upNext.length} more in this course</p>
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
            {playlist.map((item, index) => {
              const active = item.id === currentId;
              const href = `/courses/${encodeURIComponent(courseFolderId)}/watch/${encodeURIComponent(item.id)}`;
              const content = (
                <>
                  <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-slate-800 sm:w-40">
                    <Image
                      src={item.thumbnailUrl}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="160px"
                      unoptimized
                    />
                    {active && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-semibold text-white">
                        Playing
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="line-clamp-2 text-sm font-medium text-gray-900">
                      {index + 1}. {item.title}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {[item.topic, formatDate(item.meetingDate)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </>
              );

              if (active) {
                return (
                  <div
                    key={item.id}
                    className="flex gap-3 rounded-xl bg-brand-50 px-2 py-2 ring-1 ring-brand-200"
                  >
                    {content}
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={href}
                  className="flex gap-3 rounded-xl px-2 py-2 hover:bg-gray-50"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
