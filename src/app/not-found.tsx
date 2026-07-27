import { NextResponse } from "next/server";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Not found</h1>
        <p className="mt-2 text-sm text-gray-500">That page does not exist.</p>
        <a href="/" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
          Go home
        </a>
      </div>
    </div>
  );
}
