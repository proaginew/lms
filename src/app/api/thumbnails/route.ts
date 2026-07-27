import { NextResponse } from "next/server";

export const runtime = "nodejs";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hashHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function wrapTitle(title: string, maxChars = 28, maxLines = 3): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["Meeting Recording"];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    if (lines.length >= maxLines - 1) {
      lines.push(current);
      return lines.slice(0, maxLines);
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const title = (url.searchParams.get("title") ?? "Meeting Recording").trim().slice(0, 140);
  const topic = (url.searchParams.get("topic") ?? "").trim().slice(0, 60);
  const id = (url.searchParams.get("id") ?? title).trim();

  const hue = hashHue(`${id}|${title}|${topic}`);
  const hue2 = (hue + 38) % 360;
  const lines = wrapTitle(title);
  const startY = topic ? 168 : 150;
  const lineSvg = lines
    .map((line, index) => {
      const y = startY + index * 42;
      return `<text x="48" y="${y}" fill="#ffffff" font-size="34" font-weight="700" font-family="Georgia, 'Times New Roman', serif">${escapeXml(line)}</text>`;
    })
    .join("");

  const topicSvg = topic
    ? `<rect x="48" y="64" rx="16" ry="16" width="${Math.min(320, 28 + topic.length * 9)}" height="34" fill="rgba(255,255,255,0.18)"/>
       <text x="64" y="87" fill="#ffffff" font-size="16" font-weight="600" font-family="Segoe UI, Arial, sans-serif">${escapeXml(topic)}</text>`
    : "";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 62% 28%)"/>
      <stop offset="100%" stop-color="hsl(${hue2} 58% 18%)"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <circle cx="540" cy="70" r="110" fill="rgba(255,255,255,0.08)"/>
  <circle cx="590" cy="300" r="140" fill="rgba(255,255,255,0.06)"/>
  ${topicSvg}
  ${lineSvg}
  <text x="48" y="320" fill="rgba(255,255,255,0.72)" font-size="14" font-family="Segoe UI, Arial, sans-serif">AIM LMS</text>
</svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
