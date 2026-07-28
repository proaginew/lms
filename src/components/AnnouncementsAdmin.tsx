"use client";

import { useEffect, useState, useTransition } from "react";

type Row = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  type: string;
  isActive: boolean;
  priority: number;
  startAt: string;
  endAt: string | null;
};

export default function AnnouncementsAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [type, setType] = useState("GENERAL");
  const [priority, setPriority] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setImageUrl("");
    setCtaLabel("");
    setCtaHref("");
    setType("GENERAL");
    setPriority("0");
    setIsActive(true);
  }

  async function load() {
    const response = await fetch("/api/admin/announcements");
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || "Failed to load");
    setRows(json.announcements || []);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  function startEdit(row: Row) {
    setEditingId(row.id);
    setTitle(row.title);
    setDescription(row.description || "");
    setImageUrl(row.imageUrl || "");
    setCtaLabel(row.ctaLabel || "");
    setCtaHref(row.ctaHref || "");
    setType(row.type);
    setPriority(String(row.priority));
    setIsActive(row.isActive);
  }

  function save() {
    startTransition(async () => {
      setError(null);
      try {
        const payload = {
          title,
          description,
          imageUrl,
          ctaLabel,
          ctaHref,
          type,
          priority: Number(priority) || 0,
          isActive,
        };
        const response = await fetch(
          editingId ? `/api/admin/announcements/${editingId}` : "/api/admin/announcements",
          {
            method: editingId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || "Save failed");
        resetForm();
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.message || "Delete failed");
        if (editingId === id) resetForm();
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="yt-card border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <section className="yt-card space-y-3 p-4">
        <h3 className="font-semibold">
          {editingId ? "Edit announcement" : "Create announcement"}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="yt-search" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="yt-search" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="GENERAL">GENERAL</option>
            <option value="NEW_COURSE">NEW_COURSE</option>
            <option value="OFFER">OFFER</option>
          </select>
          <input className="yt-search" placeholder="Image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          <input className="yt-search" placeholder="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} />
          <input className="yt-search" placeholder="CTA label" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
          <input className="yt-search" placeholder="CTA href" value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} />
          <textarea
            className="yt-search sm:col-span-2 min-h-[80px]"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="notes-btn notes-btn-primary" disabled={isPending} onClick={save}>
            {isPending ? "Saving…" : editingId ? "Save changes" : "Create"}
          </button>
          {editingId && (
            <button type="button" className="notes-btn notes-btn-ghost" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
      </section>

      <div className="yt-card yt-table-scroll">
        <table className="yt-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="font-medium">{row.title}</div>
                  <div className="text-xs text-[var(--yt-muted)]">{row.description}</div>
                </td>
                <td>{row.type}</td>
                <td>{row.priority}</td>
                <td>{row.isActive ? "Yes" : "No"}</td>
                <td className="flex flex-wrap gap-1">
                  <button type="button" className="notes-btn notes-btn-ghost" disabled={isPending} onClick={() => startEdit(row)}>
                    Edit
                  </button>
                  <button type="button" className="notes-btn notes-btn-ghost" disabled={isPending} onClick={() => remove(row.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
