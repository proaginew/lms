"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type FeeRow = {
  id: string;
  title: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  sequence: number;
  isActive: boolean;
  _count: { invoices: number };
};

export default function CourseFeesManager() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const [courseName, setCourseName] = useState("");
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("Full Fee");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [sequence, setSequence] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setEditingId(null);
    setTitle("Full Fee");
    setAmount("");
    setDueDate("");
    setSequence("1");
    setIsActive(true);
  }

  async function load() {
    const response = await fetch(`/api/admin/courses/${courseId}/fee-structures`);
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || "Failed to load");
    setCourseName(json.course?.name || "");
    setRows(json.feeStructures || []);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [courseId]);

  function startEdit(row: FeeRow) {
    setEditingId(row.id);
    setTitle(row.title);
    setAmount(String(Number(row.amount)));
    setDueDate(row.dueDate ? row.dueDate.slice(0, 10) : "");
    setSequence(String(row.sequence));
    setIsActive(row.isActive);
  }

  function saveFee() {
    startTransition(async () => {
      setError(null);
      try {
        const payload = {
          title,
          amount: Number(amount),
          dueDate: dueDate || null,
          sequence: Number(sequence) || 1,
          isActive,
        };
        const response = await fetch(
          editingId
            ? `/api/admin/fee-structures/${editingId}`
            : `/api/admin/courses/${courseId}/fee-structures`,
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

  function removeFee(id: string) {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/admin/fee-structures/${id}`, {
          method: "DELETE",
        });
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
      <div>
        <Link href="/admin/fees" className="text-sm text-[var(--yt-muted)] hover:underline">
          ← Fees
        </Link>
        <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
          Fee structures{courseName ? ` · ${courseName}` : ""}
        </h2>
      </div>

      {error && <p className="yt-card border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="yt-card space-y-3 p-4">
        <h3 className="font-semibold">
          {editingId ? "Edit fee structure" : "Add fee / installment"}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="yt-search"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="yt-search"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="yt-search"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <input
            className="yt-search"
            placeholder="Sequence"
            value={sequence}
            onChange={(e) => setSequence(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active (auto-apply on new enrollments)
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="notes-btn notes-btn-primary"
            disabled={isPending}
            onClick={saveFee}
          >
            {isPending ? "Saving…" : editingId ? "Save changes" : "Add fee structure"}
          </button>
          {editingId && (
            <button type="button" className="notes-btn notes-btn-ghost" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
        {editingId && (
          <p className="text-xs text-[var(--yt-muted)]">
            Structures with invoices cannot be edited — create a new one instead.
          </p>
        )}
      </section>

      <div className="yt-card yt-table-scroll">
        <table className="yt-table">
          <thead>
            <tr>
              <th>Seq</th>
              <th>Title</th>
              <th>Amount</th>
              <th>Due</th>
              <th>Active</th>
              <th>Invoices</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.sequence}</td>
                <td>{row.title}</td>
                <td>
                  {row.currency} {Number(row.amount).toFixed(2)}
                </td>
                <td>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "—"}</td>
                <td>{row.isActive ? "Yes" : "No"}</td>
                <td>{row._count.invoices}</td>
                <td className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="notes-btn notes-btn-ghost"
                    disabled={isPending || row._count.invoices > 0}
                    title={
                      row._count.invoices > 0
                        ? "Locked because invoices exist"
                        : "Edit fee structure"
                    }
                    onClick={() => startEdit(row)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="notes-btn notes-btn-ghost"
                    disabled={isPending || row._count.invoices > 0}
                    title={
                      row._count.invoices > 0
                        ? "Locked because invoices exist"
                        : "Delete fee structure"
                    }
                    onClick={() => removeFee(row.id)}
                  >
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
