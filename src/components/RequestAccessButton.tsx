"use client";

import Link from "next/link";
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
  const [feeBlocked, setFeeBlocked] = useState(false);

  async function onClick() {
    setLoading(true);
    setError(null);
    setFeeBlocked(false);
    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseFolderId, courseName }),
      });
      const data = (await response.json()) as {
        message?: string;
        code?: string;
        href?: string;
      };
      if (!response.ok) {
        if (data.code === "FEE_BLOCKED") {
          setFeeBlocked(true);
          throw new Error(
            `${data.message || "Outstanding fee balance"}. Open My Fees to review dues.`,
          );
        }
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
        className="yt-btn-primary disabled:opacity-60"
      >
        {loading ? "Submitting..." : label}
      </button>
      {error && (
        <div className="text-xs text-red-600">
          <p>{error}</p>
          {feeBlocked && (
            <Link href="/my-learning/fees" className="mt-1 inline-block font-semibold underline">
              Open My Fees
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
