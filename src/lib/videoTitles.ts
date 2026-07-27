import OpenAI, { toFile } from "openai";
import { getOneDriveFileContentResponse } from "@/lib/graph";
import { prisma } from "@/lib/prisma";

const WHISPER_MAX_BYTES = 24 * 1024 * 1024;
const WHISPER_MAX_CHUNKS = 4;

export type VideoAssetView = {
  title: string;
  topic: string | null;
  meetingDate: string | null;
  thumbnailUrl: string | null;
  status: string;
  fileName: string;
};

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
}

export function cleanFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title-specific thumbnail (not random stock). */
export function webThumbnailFor(
  itemId: string,
  title?: string | null,
  topic?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("id", itemId);
  params.set("title", (title?.trim() || "Meeting Recording").slice(0, 140));
  if (topic?.trim()) {
    params.set("topic", topic.trim().slice(0, 60));
  }
  return `/api/thumbnails?${params.toString()}`;
}

function parseDateHint(fileName: string, createdDateTime?: string | null): Date | null {
  if (createdDateTime) {
    const parsed = new Date(createdDateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const patterns = [
    /(\d{4})[-_.](\d{2})[-_.](\d{2})/,
    /(\d{2})[-_.](\d{2})[-_.](\d{4})/,
  ];
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (!match) continue;
    if (match[1].length === 4) {
      const d = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) return d;
    } else {
      const d = new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

async function downloadByteRange(itemId: string, start: number, end: number): Promise<Buffer> {
  const upstream = await getOneDriveFileContentResponse(itemId, `bytes=${start}-${end}`);
  const arrayBuffer = await upstream.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function transcribeSample(bytes: Buffer, fileName: string): Promise<string> {
  const openai = getOpenAI();
  const safeName = /\.(mp4|m4a|mp3|wav|webm|mov)$/i.test(fileName)
    ? fileName
    : `${fileName}.mp4`;
  const file = await toFile(bytes, safeName);
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "text",
  });
  return String(result).trim();
}

/** Transcribe sequential file chunks for longer lectures (best-effort). */
export async function transcribeVideoFull(itemId: string, fileName: string): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < WHISPER_MAX_CHUNKS; i += 1) {
    const start = i * WHISPER_MAX_BYTES;
    const end = start + WHISPER_MAX_BYTES - 1;
    let bytes: Buffer;
    try {
      bytes = await downloadByteRange(itemId, start, end);
    } catch {
      break;
    }
    if (!bytes.length) break;
    try {
      const text = await transcribeSample(bytes, `${i}-${fileName}`);
      if (text) parts.push(text);
    } catch {
      if (i === 0) throw new Error("Transcription failed on first chunk");
      break;
    }
    if (bytes.length < WHISPER_MAX_BYTES * 0.9) break;
  }
  return parts.join("\n\n").trim();
}

type MeetingMeta = {
  title: string;
  topic: string;
  meetingDate: string | null;
};

async function meetingMetaFromTranscript(input: {
  transcript: string;
  fileName: string;
  dateHint: Date | null;
}): Promise<MeetingMeta> {
  const openai = getOpenAI();
  const fallbackTitle = cleanFileName(input.fileName) || "Meeting Recording";
  const hint = input.dateHint ? input.dateHint.toISOString().slice(0, 10) : null;

  if (!input.transcript || input.transcript.length < 12) {
    return {
      title: fallbackTitle,
      topic: "General",
      meetingDate: hint,
    };
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You name meeting recordings from transcript context. Return JSON only with keys: title (max 10 words, Title Case, no quotes), topic (2-4 words category like 'Product Planning', 'Client Review', 'Engineering Sync'), meetingDate (YYYY-MM-DD or null if unknown).",
      },
      {
        role: "user",
        content: JSON.stringify({
          fileName: input.fileName,
          dateHint: hint,
          transcriptExcerpt: input.transcript.slice(0, 3500),
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: Partial<MeetingMeta> = {};
  try {
    parsed = JSON.parse(raw) as Partial<MeetingMeta>;
  } catch {
    parsed = {};
  }

  const title = (parsed.title ?? "").trim().replace(/^["']|["']$/g, "") || fallbackTitle;
  const topic = (parsed.topic ?? "").trim() || "General";
  let meetingDate = hint;
  if (parsed.meetingDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.meetingDate)) {
    meetingDate = parsed.meetingDate;
  }

  return { title, topic, meetingDate };
}

export async function getTitlesForItems(itemIds: string[]) {
  if (itemIds.length === 0) {
    return new Map<string, VideoAssetView>();
  }
  const rows = await prisma.videoAsset.findMany({
    where: { itemId: { in: itemIds } },
  });
  return new Map(
    rows.map((row) => [
      row.itemId,
      {
        title: row.title?.trim() || cleanFileName(row.fileName),
        topic: row.topic,
        meetingDate: row.meetingDate ? row.meetingDate.toISOString().slice(0, 10) : null,
        thumbnailUrl: webThumbnailFor(row.itemId, row.title, row.topic),
        status: row.status,
        fileName: row.fileName,
      },
    ]),
  );
}

/** Generate once and persist. Skips READY/FAILED unless force=true. */
export async function enrichVideoTitle(input: {
  itemId: string;
  courseFolderId: string;
  fileName: string;
  createdDateTime?: string | null;
  force?: boolean;
}) {
  const existing = await prisma.videoAsset.findUnique({ where: { itemId: input.itemId } });
  if (
    !input.force &&
    existing &&
    (existing.status === "READY" || existing.status === "FAILED") &&
    existing.title
  ) {
    return existing;
  }

  await prisma.videoAsset.upsert({
    where: { itemId: input.itemId },
    create: {
      itemId: input.itemId,
      courseFolderId: input.courseFolderId,
      fileName: input.fileName,
      status: "PENDING",
    },
    update: {
      courseFolderId: input.courseFolderId,
      fileName: input.fileName,
      status: "PENDING",
      errorMessage: null,
    },
  });

  const dateHint = parseDateHint(input.fileName, input.createdDateTime);

  try {
    const transcript = await transcribeVideoFull(input.itemId, input.fileName);
    const meta = await meetingMetaFromTranscript({
      transcript,
      fileName: input.fileName,
      dateHint,
    });

    return prisma.videoAsset.update({
      where: { itemId: input.itemId },
      data: {
        title: meta.title,
        topic: meta.topic,
        meetingDate: meta.meetingDate ? new Date(`${meta.meetingDate}T00:00:00.000Z`) : dateHint,
        thumbnailUrl: webThumbnailFor(input.itemId, meta.title, meta.topic),
        transcriptPreview: transcript.slice(0, 1500) || null,
        transcriptFull: transcript || null,
        status: "READY",
        errorMessage: null,
        ...(existing?.notesStatus === "NONE" || !existing
          ? { notesStatus: "PENDING" }
          : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Title enrichment failed";
    const fallbackTitle = cleanFileName(input.fileName) || "Meeting Recording";
    return prisma.videoAsset.update({
      where: { itemId: input.itemId },
      data: {
        title: fallbackTitle,
        topic: "General",
        meetingDate: dateHint,
        thumbnailUrl: webThumbnailFor(input.itemId, fallbackTitle, "General"),
        status: "FAILED",
        errorMessage: message.slice(0, 500),
      },
    });
  }
}

export async function updateVideoMeta(input: {
  itemId: string;
  courseFolderId?: string;
  fileName?: string;
  title?: string;
  topic?: string | null;
  thumbnailUrl?: string | null;
  meetingDate?: string | null;
}) {
  const existing = await prisma.videoAsset.findUnique({ where: { itemId: input.itemId } });
  const title = input.title?.trim();
  const topic =
    input.topic === undefined ? existing?.topic ?? null : input.topic?.trim() || null;
  const fileName = input.fileName?.trim() || existing?.fileName || "Meeting Recording";
  const resolvedTitle = title || existing?.title || cleanFileName(fileName) || "Meeting Recording";
  const thumbnailUrl =
    input.thumbnailUrl === undefined
      ? webThumbnailFor(input.itemId, resolvedTitle, topic)
      : input.thumbnailUrl?.trim() || webThumbnailFor(input.itemId, resolvedTitle, topic);

  let meetingDate = existing?.meetingDate ?? null;
  if (input.meetingDate !== undefined) {
    meetingDate =
      input.meetingDate && /^\d{4}-\d{2}-\d{2}$/.test(input.meetingDate)
        ? new Date(`${input.meetingDate}T00:00:00.000Z`)
        : null;
  }

  const courseFolderId = input.courseFolderId?.trim() || existing?.courseFolderId;
  if (!courseFolderId) {
    throw new Error("NOT_FOUND");
  }

  return prisma.videoAsset.upsert({
    where: { itemId: input.itemId },
    create: {
      itemId: input.itemId,
      courseFolderId,
      fileName,
      title: resolvedTitle,
      topic,
      thumbnailUrl,
      meetingDate,
      status: "READY",
    },
    update: {
      ...(title ? { title } : {}),
      topic,
      thumbnailUrl,
      meetingDate,
      status: "READY",
      errorMessage: null,
    },
  });
}
