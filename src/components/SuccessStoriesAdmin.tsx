"use client";

import { useEffect, useState, useTransition } from "react";

type Row = {
  id: string;
  studentName: string;
  photoUrl: string | null;
  companyName: string;
  jobTitle: string;
  testimonial: string | null;
  isFeatured: boolean;
  course: { name: string } | null;
};

export default function SuccessStoriesAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [testimonial, setTestimonial] = useState("");
  const [isFeatured, setIsFeatured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setEditingId(null);
    setStudentName("");
    setCompanyName("");
    setJobTitle("");
    setPhotoUrl("");
    setTestimonial("");
    setIsFeatured(true);
  }

  async function load() {
    const response = await fetch("/api/admin/success-stories");
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || "Failed to load");
    setRows(json.stories || []);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  function startEdit(row: Row) {
    setEditingId(row.id);
    setStudentName(row.studentName);
    setCompanyName(row.companyName);
    setJobTitle(row.jobTitle);
    setPhotoUrl(row.photoUrl || "");
    setTestimonial(row.testimonial || "");
    setIsFeatured(row.isFeatured);
  }

  function save() {
    startTransition(async () => {
      setError(null);
      try {
        const payload = {
          studentName,
          companyName,
          jobTitle,
          photoUrl,
          testimonial,
          isFeatured,
        };
        const response = await fetch(
          editingId ? `/api/admin/success-stories/${editingId}` : "/api/admin/success-stories",
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
        const response = await fetch(`/api/admin/success-stories/${id}`, { method: "DELETE" });
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
          {editingId ? "Edit success story" : "Add success story"}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="yt-search" placeholder="Student name" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
          <input className="yt-search" placeholder="Company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <input className="yt-search" placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          <input className="yt-search" placeholder="Photo URL" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
          <textarea
            className="yt-search sm:col-span-2 min-h-[80px]"
            placeholder="Testimonial"
            value={testimonial}
            onChange={(e) => setTestimonial(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
          Featured on student home
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
              <th>Student</th>
              <th>Role</th>
              <th>Company</th>
              <th>Featured</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.studentName}</td>
                <td>{row.jobTitle}</td>
                <td>{row.companyName}</td>
                <td>{row.isFeatured ? "Yes" : "No"}</td>
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
