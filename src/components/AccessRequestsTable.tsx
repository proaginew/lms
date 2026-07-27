"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  courseFolderId: string;
  courseName: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  rejectionReason: string | null;
  requestedAt: string;
  user: { name: string | null; email: string | null };
};

export default function AccessRequestsTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/access-requests", { cache: "no-store" });
      const data = (await response.json()) as { requests?: Row[]; message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to load requests");
      }
      setRows(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: "approve" | "reject" | "revoke") {
    setActiveId(id);
    setError(null);
    try {
      let rejectionReason: string | undefined;
      if (action === "reject") {
        rejectionReason = window.prompt("Rejection reason (optional)") ?? undefined;
      }
      if (action === "revoke") {
        rejectionReason = "Revoked by admin";
      }
      const response = await fetch(`/api/admin/access-requests/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? `Failed to ${action}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActiveId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading requests...</p>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No access requests yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.user.name ?? "—"}</div>
                    <div className="text-xs text-gray-500">{row.user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.courseName}</div>
                    <div className="text-[11px] text-gray-400">{row.courseFolderId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium">
                      {row.status}
                    </span>
                    {row.rejectionReason && (
                      <p className="mt-1 text-xs text-red-600">{row.rejectionReason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(row.requestedAt).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {row.status !== "APPROVED" && (
                        <button
                          type="button"
                          disabled={activeId === row.id}
                          onClick={() => act(row.id, "approve")}
                          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                        >
                          Approve
                        </button>
                      )}
                      {row.status === "PENDING" && (
                        <button
                          type="button"
                          disabled={activeId === row.id}
                          onClick={() => act(row.id, "reject")}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      )}
                      {row.status === "APPROVED" && (
                        <button
                          type="button"
                          disabled={activeId === row.id}
                          onClick={() => act(row.id, "revoke")}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
