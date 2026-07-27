"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Learner = {
  userId: string;
  name: string;
  courseName: string;
  videoTitle: string;
};

export default function LiveUsersChip({ isAdmin }: { isAdmin: boolean }) {
  const [count, setCount] = useState(0);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/live-users");
        if (!response.ok) return;
        const json = (await response.json()) as {
          count?: number;
          learners?: Learner[];
        };
        if (cancelled) return;
        setCount(json.count || 0);
        setLearners(json.learners || []);
      } catch {
        // ignore
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 25000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        className="live-chip"
        onClick={() => isAdmin && setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="live-dot" aria-hidden />
        <span>{count} live</span>
      </button>
      {isAdmin && open && (
        <div className="live-popover">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Live now</p>
            <Link href="/admin/analytics" className="text-xs text-[var(--yt-muted)] hover:underline">
              Analytics
            </Link>
          </div>
          {learners.length === 0 ? (
            <p className="text-xs text-[var(--yt-muted)]">Nobody watching right now.</p>
          ) : (
            <ul className="space-y-2">
              {learners.slice(0, 8).map((learner) => (
                <li key={learner.userId} className="text-xs">
                  <p className="font-medium text-[var(--yt-ink)]">{learner.name}</p>
                  <p className="text-[var(--yt-muted)] line-clamp-1">
                    {learner.videoTitle} · {learner.courseName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
