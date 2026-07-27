import OpenAI from "openai";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getContentModel } from "@/lib/openaiModels";
import { cleanFileName, enrichVideoTitle, webThumbnailFor } from "@/lib/videoTitles";
import { getOneDriveFileMeta } from "@/lib/graph";

export type NotesSection = {
  heading: string;
  body: string;
  bullets?: string[];
};

export type NotesGlossaryItem = {
  term: string;
  definition: string;
};

export type VideoNotesContent = {
  headline: string;
  summary: string;
  keyTakeaways: string[];
  sections: NotesSection[];
  glossary: NotesGlossaryItem[];
  studyTips: string[];
};

export type VideoNotesView = {
  itemId: string;
  title: string;
  topic: string | null;
  meetingDate: string | null;
  courseFolderId: string;
  notesStatus: string;
  notesError: string | null;
  notesGeneratedAt: string | null;
  notes: VideoNotesContent | null;
};

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
}

function emptyNotes(title: string): VideoNotesContent {
  return {
    headline: title,
    summary: "",
    keyTakeaways: [],
    sections: [],
    glossary: [],
    studyTips: [],
  };
}

export function parseNotesJson(raw: string | null | undefined): VideoNotesContent | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VideoNotesContent>;
    return {
      headline: (parsed.headline ?? "").trim() || "Study Notes",
      summary: (parsed.summary ?? "").trim(),
      keyTakeaways: Array.isArray(parsed.keyTakeaways)
        ? parsed.keyTakeaways.map((item) => String(item).trim()).filter(Boolean)
        : [],
      sections: Array.isArray(parsed.sections)
        ? parsed.sections
            .map((section) => ({
              heading: String(section?.heading ?? "").trim(),
              body: String(section?.body ?? "").trim(),
              bullets: Array.isArray(section?.bullets)
                ? section.bullets.map((b) => String(b).trim()).filter(Boolean)
                : [],
            }))
            .filter((section) => section.heading || section.body)
        : [],
      glossary: Array.isArray(parsed.glossary)
        ? parsed.glossary
            .map((item) => ({
              term: String(item?.term ?? "").trim(),
              definition: String(item?.definition ?? "").trim(),
            }))
            .filter((item) => item.term && item.definition)
        : [],
      studyTips: Array.isArray(parsed.studyTips)
        ? parsed.studyTips.map((item) => String(item).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return null;
  }
}

type OutlineTopic = {
  id: string;
  heading: string;
  focus: string;
  excerptHint: string;
};

function chunkText(text: string, size: number, overlap = 400): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
    i += size - overlap;
  }
  return chunks.length ? chunks : [text];
}

async function outlineFromChunk(input: {
  chunk: string;
  title: string;
  chunkIndex: number;
}): Promise<OutlineTopic[]> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: getContentModel(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract EVERY distinct teaching point from this transcript chunk for exhaustive study notes.
Return JSON: { "topics": [{ "heading": string, "focus": string, "excerptHint": string }] }
Rules:
- Prefer many atomic topics over few broad ones (aim for dense coverage).
- Do not skip definitions, steps, examples, warnings, formulas, comparisons, or demos.
- excerptHint: short phrase to locate the point in the chunk.
- No markdown/emojis.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          title: input.title,
          chunkIndex: input.chunkIndex,
          transcriptChunk: input.chunk,
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw) as { topics?: Array<Partial<OutlineTopic>> };
    return (parsed.topics ?? [])
      .map((t, idx) => ({
        id: `c${input.chunkIndex}-${idx}`,
        heading: String(t.heading ?? "").trim(),
        focus: String(t.focus ?? "").trim(),
        excerptHint: String(t.excerptHint ?? "").trim(),
      }))
      .filter((t) => t.heading);
  } catch {
    return [];
  }
}

async function expandTopic(input: {
  topic: OutlineTopic;
  transcript: string;
  title: string;
}): Promise<NotesSection> {
  const openai = getOpenAI();
  const window = input.transcript.slice(0, 14000);
  const completion = await openai.chat.completions.create({
    model: getContentModel(),
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert instructor writing VERY elaborate study notes for one lecture topic.
Return JSON: { "heading": string, "body": string, "bullets": string[] }
Rules:
- body: 4-8 rich teaching paragraphs separated by \\n\\n.
- Explain what / why / how; include examples, edge cases, and common mistakes from the lecture.
- Write so a student can learn the topic without rewatching that part of the video.
- Prefer depth and completeness over brevity — never thin summaries.
- bullets: 4-10 concrete checkpoints, steps, or recall prompts.
- No markdown/emojis.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          lectureTitle: input.title,
          topic: input.topic,
          transcriptWindow: window,
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw) as Partial<NotesSection>;
    return {
      heading: (parsed.heading ?? input.topic.heading).trim(),
      body: String(parsed.body ?? "").trim(),
      bullets: Array.isArray(parsed.bullets)
        ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return {
      heading: input.topic.heading,
      body: input.topic.focus || "See the lecture recording for details on this topic.",
      bullets: [],
    };
  }
}

async function wrapUpNotes(input: {
  title: string;
  topic: string | null;
  sections: NotesSection[];
  transcript: string;
}): Promise<Pick<VideoNotesContent, "headline" | "summary" | "keyTakeaways" | "glossary" | "studyTips">> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: getContentModel(),
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Create wrap-up study materials for a long lecture — detailed enough to print as a study guide.
Return JSON: {
  "headline": string,
  "summary": string,
  "keyTakeaways": string[],
  "glossary": [{ "term": string, "definition": string }],
  "studyTips": string[]
}
Rules:
- summary: 5-10 elaborate paragraphs (\\n\\n) covering the whole lecture arc with connections between topics.
- keyTakeaways: one crisp bullet per major topic (can be many; do not under-cover).
- glossary: thorough definitions for every important term/acronym.
- studyTips: 6-10 concrete revision tips tied to this lecture.
- No markdown/emojis.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          title: input.title,
          topic: input.topic,
          sectionHeadings: input.sections.map((s) => s.heading),
          transcriptExcerpt: input.transcript.slice(0, 14000),
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw) as Partial<VideoNotesContent>;
    return {
      headline: (parsed.headline ?? input.title).trim(),
      summary: String(parsed.summary ?? "").trim(),
      keyTakeaways: Array.isArray(parsed.keyTakeaways)
        ? parsed.keyTakeaways.map((x) => String(x).trim()).filter(Boolean)
        : input.sections.map((s) => s.heading),
      glossary: Array.isArray(parsed.glossary)
        ? parsed.glossary
            .map((g) => ({
              term: String(g?.term ?? "").trim(),
              definition: String(g?.definition ?? "").trim(),
            }))
            .filter((g) => g.term && g.definition)
        : [],
      studyTips: Array.isArray(parsed.studyTips)
        ? parsed.studyTips.map((x) => String(x).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return {
      headline: input.title,
      summary: input.sections
        .slice(0, 5)
        .map((s) => s.body.split(/\n\n/)[0] || s.heading)
        .join("\n\n"),
      keyTakeaways: input.sections.map((s) => s.heading),
      glossary: [],
      studyTips: ["Review each section and rewrite key ideas in your own words."],
    };
  }
}

async function notesFromTranscript(input: {
  transcript: string;
  title: string;
  topic: string | null;
  fileName: string;
  existingOutline?: OutlineTopic[] | null;
  existingSections?: NotesSection[] | null;
}): Promise<{ notes: VideoNotesContent; outline: OutlineTopic[] }> {
  const fallback = emptyNotes(input.title);

  if (!input.transcript || input.transcript.length < 40) {
    return {
      notes: {
        ...fallback,
        summary:
          "A full transcript was not available for this recording, so detailed study notes could not be generated yet.",
        studyTips: ["Watch the video carefully and jot down your own key points."],
      },
      outline: [],
    };
  }

  let outline = input.existingOutline ?? [];
  if (!outline.length) {
    const chunks = chunkText(input.transcript, 7000, 500);
    for (let i = 0; i < chunks.length; i += 1) {
      const topics = await outlineFromChunk({
        chunk: chunks[i],
        title: input.title,
        chunkIndex: i,
      });
      outline.push(...topics);
    }
    // Deduplicate by similar headings
    const seen = new Set<string>();
    outline = outline.filter((t) => {
      const key = t.heading.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const sections: NotesSection[] = [...(input.existingSections ?? [])];
  const startAt = sections.length;
  // Expand in batches; cap sections for a single invocation budget
  const MAX_EXPAND_PER_RUN = 6;
  const toExpand = outline.slice(startAt, startAt + MAX_EXPAND_PER_RUN);
  for (const topic of toExpand) {
    sections.push(
      await expandTopic({
        topic,
        transcript: input.transcript,
        title: input.title,
      }),
    );
  }

  if (sections.length < outline.length) {
    // Partial progress — caller should resume
    return {
      notes: {
        headline: input.title,
        summary: "Notes generation in progress…",
        keyTakeaways: outline.map((t) => t.heading),
        sections,
        glossary: [],
        studyTips: [],
      },
      outline,
    };
  }

  const wrap = await wrapUpNotes({
    title: input.title,
    topic: input.topic,
    sections,
    transcript: input.transcript,
  });

  return {
    notes: {
      ...wrap,
      sections,
    },
    outline,
  };
}

export async function getVideoNotes(itemId: string): Promise<VideoNotesView | null> {
  const row = await prisma.videoAsset.findUnique({ where: { itemId } });
  if (!row) return null;
  return {
    itemId: row.itemId,
    title: row.title?.trim() || cleanFileName(row.fileName),
    topic: row.topic,
    meetingDate: row.meetingDate ? row.meetingDate.toISOString().slice(0, 10) : null,
    courseFolderId: row.courseFolderId,
    notesStatus: row.notesStatus,
    notesError: row.notesError,
    notesGeneratedAt: row.notesGeneratedAt?.toISOString() ?? null,
    notes: parseNotesJson(row.notesJson),
  };
}

/** Generate exhaustive study notes from transcript. Skips OpenAI when READY unless force. */
export async function generateVideoNotes(input: {
  itemId: string;
  courseFolderId: string;
  force?: boolean;
}) {
  const existing = await prisma.videoAsset.findUnique({ where: { itemId: input.itemId } });

  if (!input.force && existing?.notesStatus === "READY" && existing.notesJson) {
    return existing;
  }

  await prisma.videoAsset.upsert({
    where: { itemId: input.itemId },
    create: {
      itemId: input.itemId,
      courseFolderId: input.courseFolderId,
      fileName: existing?.fileName || "Meeting Recording",
      status: existing?.status || "PENDING",
      notesStatus: "PENDING",
      notesError: null,
    },
    update: {
      courseFolderId: input.courseFolderId,
      notesStatus: "PENDING",
      notesError: null,
      ...(input.force
        ? { notesOutlineJson: null, notesJson: null }
        : {}),
    },
  });

  try {
    let row = await prisma.videoAsset.findUnique({ where: { itemId: input.itemId } });
    let transcript = row?.transcriptFull?.trim() || row?.transcriptPreview?.trim() || "";

    if (!transcript || transcript.length < 40) {
      let fileName = row?.fileName || "Meeting Recording";
      let createdDateTime: string | null = null;
      try {
        const meta = await getOneDriveFileMeta(input.itemId);
        fileName = meta.name || fileName;
        createdDateTime = meta.createdDateTime ?? null;
      } catch {
        // keep cached fileName
      }

      row = await enrichVideoTitle({
        itemId: input.itemId,
        courseFolderId: input.courseFolderId,
        fileName,
        createdDateTime,
        force: true,
      });
      transcript = row.transcriptFull?.trim() || row.transcriptPreview?.trim() || "";
    }

    const title = row?.title?.trim() || cleanFileName(row?.fileName || "") || "Study Notes";
    let existingOutline: OutlineTopic[] | null = null;
    let existingSections: NotesSection[] | null = null;
    if (!input.force && row?.notesOutlineJson) {
      try {
        existingOutline = JSON.parse(row.notesOutlineJson) as OutlineTopic[];
      } catch {
        existingOutline = null;
      }
    }
    if (!input.force && row?.notesJson) {
      const partial = parseNotesJson(row.notesJson);
      if (partial?.sections?.length) existingSections = partial.sections;
    }

    const { notes, outline } = await notesFromTranscript({
      transcript,
      title,
      topic: row?.topic ?? null,
      fileName: row?.fileName || "Meeting Recording",
      existingOutline,
      existingSections,
    });

    const complete = outline.length > 0 && notes.sections.length >= outline.length;

    return prisma.videoAsset.update({
      where: { itemId: input.itemId },
      data: {
        notesJson: JSON.stringify(notes),
        notesOutlineJson: JSON.stringify(outline),
        notesStatus: complete ? "READY" : "PENDING",
        notesError: null,
        notesGeneratedAt: complete ? new Date() : row?.notesGeneratedAt ?? null,
        notesUpdatedAt: new Date(),
        quizStatus:
          complete && (row?.quizStatus === "NONE" || !row?.quizStatus)
            ? "PENDING"
            : row?.quizStatus,
        thumbnailUrl:
          row?.thumbnailUrl || webThumbnailFor(input.itemId, title, row?.topic ?? null),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notes generation failed";
    return prisma.videoAsset.update({
      where: { itemId: input.itemId },
      data: {
        notesStatus: "FAILED",
        notesError: message.slice(0, 500),
      },
    });
  }
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "study-notes"
  );
}

export function notesFileBaseName(title: string) {
  return `${slugify(title)}-notes`;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function buildNotesPdf(input: {
  title: string;
  topic: string | null;
  meetingDate: string | null;
  courseName: string;
  notes: VideoNotesContent;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 14;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawLines = (
    lines: string[],
    options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number },
  ) => {
    const size = options.size ?? 11;
    const gap = options.gap ?? lineHeight;
    const color = options.color ?? rgb(0.1, 0.1, 0.12);
    const useFont = options.bold ? fontBold : font;
    for (const line of lines) {
      ensureSpace(gap + 2);
      page.drawText(line, {
        x: margin,
        y: y - size,
        size,
        font: useFont,
        color,
        maxWidth,
      });
      y -= gap;
    }
  };

  const drawParagraph = (
    text: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      charsPerLine?: number;
      gap?: number;
    } = {},
  ) => {
    const chars = options.charsPerLine ?? 88;
    const blocks = text.split(/\n\n+/);
    for (const block of blocks) {
      drawLines(wrapText(block.replace(/\n/g, " "), chars), options);
      y -= 6;
    }
  };

  drawParagraph(input.notes.headline || input.title, {
    size: 20,
    bold: true,
    charsPerLine: 48,
    gap: 24,
  });
  y -= 4;
  const meta = [input.courseName, input.topic, input.meetingDate].filter(Boolean).join("  ·  ");
  if (meta) {
    drawParagraph(meta, { size: 10, color: rgb(0.4, 0.4, 0.45), charsPerLine: 95, gap: 13 });
  }
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.88),
  });
  y -= 18;

  if (input.notes.summary) {
    drawParagraph("Overview", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    drawParagraph(input.notes.summary, { size: 11, gap: 15 });
    y -= 8;
  }

  if (input.notes.keyTakeaways.length) {
    drawParagraph("Key takeaways", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const item of input.notes.keyTakeaways) {
      drawParagraph(`•  ${item}`, { size: 11, gap: 14, charsPerLine: 84 });
    }
    y -= 8;
  }

  for (const section of input.notes.sections) {
    if (section.heading) {
      drawParagraph(section.heading, { size: 13, bold: true, charsPerLine: 72, gap: 17 });
    }
    if (section.body) {
      drawParagraph(section.body, { size: 11, gap: 15 });
    }
    for (const bullet of section.bullets ?? []) {
      drawParagraph(`•  ${bullet}`, { size: 11, gap: 14, charsPerLine: 84 });
    }
    y -= 6;
  }

  if (input.notes.glossary.length) {
    drawParagraph("Glossary", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const item of input.notes.glossary) {
      drawParagraph(`${item.term}: ${item.definition}`, { size: 11, gap: 14 });
    }
    y -= 6;
  }

  if (input.notes.studyTips.length) {
    drawParagraph("Study tips", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const tip of input.notes.studyTips) {
      drawParagraph(`•  ${tip}`, { size: 11, gap: 14, charsPerLine: 84 });
    }
  }

  return pdf.save();
}

export async function buildNotesDocx(input: {
  title: string;
  topic: string | null;
  meetingDate: string | null;
  courseName: string;
  notes: VideoNotesContent;
}): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: input.notes.headline || input.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
  );

  const meta = [input.courseName, input.topic, input.meetingDate].filter(Boolean).join(" · ");
  if (meta) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: meta, italics: true, size: 20, color: "666666" })],
        spacing: { after: 280 },
      }),
    );
  }

  const addHeading = (text: string) => {
    children.push(
      new Paragraph({
        text,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 120 },
      }),
    );
  };

  const addBody = (text: string) => {
    for (const block of text.split(/\n\n+/)) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: block.replace(/\n/g, " "), size: 22 })],
          spacing: { after: 140 },
        }),
      );
    }
  };

  const addBullet = (text: string) => {
    children.push(
      new Paragraph({
        text,
        bullet: { level: 0 },
        spacing: { after: 80 },
      }),
    );
  };

  if (input.notes.summary) {
    addHeading("Overview");
    addBody(input.notes.summary);
  }

  if (input.notes.keyTakeaways.length) {
    addHeading("Key takeaways");
    input.notes.keyTakeaways.forEach(addBullet);
  }

  for (const section of input.notes.sections) {
    if (section.heading) {
      children.push(
        new Paragraph({
          text: section.heading,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 100 },
        }),
      );
    }
    if (section.body) addBody(section.body);
    (section.bullets ?? []).forEach(addBullet);
  }

  if (input.notes.glossary.length) {
    addHeading("Glossary");
    for (const item of input.notes.glossary) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${item.term}: `, bold: true, size: 22 }),
            new TextRun({ text: item.definition, size: 22 }),
          ],
          spacing: { after: 100 },
        }),
      );
    }
  }

  if (input.notes.studyTips.length) {
    addHeading("Study tips");
    input.notes.studyTips.forEach(addBullet);
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
