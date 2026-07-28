"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

type CourseRow = {
  id: string;
  name: string;
  courseFolderId: string;
  _count: { feeStructures: number; enrollments: number };
};

type InvoiceRow = {
  id: string;
  amount: string;
  amountPaid: string;
  status: string;
  dueDate: string;
  enrollment: {
    user: { id: string; name: string | null; email: string | null };
    course: { id: string; name: string };
  };
  feeStructure: { title: string } | null;
};

export default function AdminFeesPanel() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("UPI_MANUAL");
  const [payRef, setPayRef] = useState("");
  const [isPending, startTransition] = useTransition();

  async function load() {
    setError(null);
    try {
      const [cRes, iRes] = await Promise.all([
        fetch("/api/admin/courses"),
        fetch(
          `/api/admin/invoices${statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ""}`,
        ),
      ]);
      const cJson = await cRes.json();
      const iJson = await iRes.json();
      if (!cRes.ok) throw new Error(cJson.message || "Failed to load courses");
      if (!iRes.ok) throw new Error(iJson.message || "Failed to load invoices");
      setCourses(cJson.courses || []);
      setInvoices(iJson.invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function recordPayment(invoiceId: string) {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/admin/invoices/${invoiceId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(payAmount),
            method: payMethod,
            referenceNo: payRef || undefined,
          }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || "Payment failed");
        setPayId(null);
        setPayAmount("");
        setPayRef("");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payment failed");
      }
    });
  }

  function waive(invoiceId: string) {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/admin/invoices/${invoiceId}/waive`, {
          method: "POST",
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || "Waive failed");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Waive failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="yt-card border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Courses & fee structures</h3>
        <div className="yt-card yt-table-scroll">
          <table className="yt-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Fee plans</th>
                <th>Enrollments</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {courses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--yt-muted)]">
                    No courses in DB yet. Approve an access request or open a course to sync.
                  </td>
                </tr>
              ) : (
                courses.map((course) => (
                  <tr key={course.id}>
                    <td className="font-medium">{course.name}</td>
                    <td>{course._count.feeStructures}</td>
                    <td>{course._count.enrollments}</td>
                    <td>
                      <Link
                        href={`/admin/courses/${course.id}/fees`}
                        className="text-sm text-[#0284c7] hover:underline"
                      >
                        Manage fees
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Invoices</h3>
          <select
            className="yt-search max-w-[180px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {["PENDING", "PARTIAL", "PAID", "OVERDUE", "WAIVED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="yt-card yt-table-scroll">
          <table className="yt-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Fee</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Status</th>
                <th>Due</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[var(--yt-muted)]">
                    No invoices yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <div className="font-medium">{inv.enrollment.user.name || "Learner"}</div>
                      <div className="text-xs text-[var(--yt-muted)]">
                        {inv.enrollment.user.email}
                      </div>
                      <Link
                        href={`/admin/students/${inv.enrollment.user.id}/fees`}
                        className="text-xs text-[#0284c7] hover:underline"
                      >
                        Ledger
                      </Link>
                    </td>
                    <td>{inv.enrollment.course.name}</td>
                    <td>{inv.feeStructure?.title || "—"}</td>
                    <td>₹{Number(inv.amount).toFixed(2)}</td>
                    <td>₹{Number(inv.amountPaid).toFixed(2)}</td>
                    <td>{inv.status}</td>
                    <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="space-y-1">
                      {payId === inv.id ? (
                        <div className="flex flex-col gap-1">
                          <input
                            className="yt-search"
                            placeholder="Amount"
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                          />
                          <select
                            className="yt-search"
                            value={payMethod}
                            onChange={(e) => setPayMethod(e.target.value)}
                          >
                            {["CASH", "BANK_TRANSFER", "CHEQUE", "UPI_MANUAL", "OTHER"].map(
                              (m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ),
                            )}
                          </select>
                          <input
                            className="yt-search"
                            placeholder="Reference"
                            value={payRef}
                            onChange={(e) => setPayRef(e.target.value)}
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="notes-btn notes-btn-primary"
                              disabled={isPending}
                              onClick={() => recordPayment(inv.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="notes-btn notes-btn-ghost"
                              onClick={() => setPayId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {inv.status !== "PAID" &&
                            inv.status !== "WAIVED" &&
                            inv.status !== "CANCELLED" && (
                              <>
                                <button
                                  type="button"
                                  className="notes-btn notes-btn-primary"
                                  onClick={() => {
                                    setPayId(inv.id);
                                    setPayAmount(
                                      String(
                                        Math.max(
                                          0,
                                          Number(inv.amount) - Number(inv.amountPaid),
                                        ).toFixed(2),
                                      ),
                                    );
                                  }}
                                >
                                  Record payment
                                </button>
                                <button
                                  type="button"
                                  className="notes-btn notes-btn-ghost"
                                  disabled={isPending}
                                  onClick={() => waive(inv.id)}
                                >
                                  Waive
                                </button>
                              </>
                            )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
