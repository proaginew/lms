"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
          <h1 className="text-xl font-semibold">Could not load this page</h1>
          <p className="max-w-lg text-center text-sm text-gray-600">
            {error.message || "A server error occurred after sign-in."}
          </p>
          <button type="button" onClick={reset}>
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
