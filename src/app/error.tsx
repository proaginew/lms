"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6">
      <h1 className="text-xl font-semibold text-gray-900">Could not load this page</h1>
      <p className="max-w-lg text-center text-sm text-gray-600">
        {error.message || "A server error occurred after sign-in."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white"
      >
        Retry
      </button>
    </div>
  );
}
