"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Note = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Note[]>([]);

  async function load() {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const json = await response.json();
      setItems(json.notifications || []);
      setUnread(json.unread || 0);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    await load();
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="live-chip"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        Bell
        {unread > 0 ? <span className="font-semibold">{unread}</span> : null}
      </button>
      {open && (
        <div className="live-popover z-50">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Notifications</p>
            <button type="button" className="text-xs text-[var(--yt-muted)] hover:underline" onClick={() => void markAll()}>
              Mark all read
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs text-[var(--yt-muted)]">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border p-2 text-xs ${item.readAt ? "border-[var(--yt-border)]" : "border-sky-200 bg-sky-50"}`}
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-[var(--yt-muted)]">{item.body}</p>
                  {item.href ? (
                    <Link href={item.href} className="mt-1 inline-block text-[#0284c7] hover:underline" onClick={() => setOpen(false)}>
                      Open
                    </Link>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
