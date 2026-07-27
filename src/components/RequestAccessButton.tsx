"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  courseFolderId: string;
  courseName: string;
  disabled?: boolean;
  label?: string;
};

export default function RequestAccessButton({
  courseFolderId,
  courseName,
  disabled,
  label = "Request access",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseFolderId, courseName }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to request access");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request access");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        {loading ? "Submitting..." : label}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
