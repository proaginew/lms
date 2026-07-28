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

export type TopicNotes = {
  name: string;
  timestamp: string | null;
  explanation: string;
  importantPoints: string[];
  steps: string[];
  commandsCode: string[];
  examples: string[];
  bestPractices: string[];
  commonMistakes: string[];
  notes: string[];
};

export type QaItem = {
  question: string;
  answer: string;
};

export type TimestampIndexItem = {
  timestamp: string;
  topic: string;
};

export type VideoNotesContent = {
  headline: string;
  overview: string;
  learningObjectives: string[];
  topics: TopicNotes[];
  glossary: NotesGlossaryItem[];
  questionsAndAnswers: QaItem[];
  keyTakeaways: string[];
  timestampIndex: TimestampIndexItem[];
  actionItems: string[];
  references: string[];
  /** Legacy aliases kept for older notes / exports */
  summary: string;
  sections: NotesSection[];
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

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function emptyNotes(title: string): VideoNotesContent {
  return {
    headline: title,
    overview: "",
    learningObjectives: [],
    topics: [],
    glossary: [],
    questionsAndAnswers: [],
    keyTakeaways: [],
    timestampIndex: [],
    actionItems: [],
    references: [],
    summary: "",
    sections: [],
    studyTips: [],
  };
}

function topicFromLegacySection(section: NotesSection): TopicNotes {
  return {
    name: section.heading || "Topic",
    timestamp: null,
    explanation: section.body || "",
    importantPoints: section.bullets ?? [],
    steps: [],
    commandsCode: [],
    examples: [],
    bestPractices: [],
    commonMistakes: [],
    notes: [],
  };
}

function sectionsFromTopics(topics: TopicNotes[]): NotesSection[] {
  return topics.map((topic) => ({
    heading: topic.name,
    body: topic.explanation,
    bullets: topic.importantPoints,
  }));
}

export function normalizeNotesContent(
  partial: Partial<VideoNotesContent> & { headline?: string },
): VideoNotesContent {
  const topicsRaw = Array.isArray(partial.topics) ? partial.topics : [];
  let topics: TopicNotes[] = topicsRaw
    .map((topic) => ({
      name: String(topic?.name ?? "").trim(),
      timestamp: topic?.timestamp ? String(topic.timestamp).trim() : null,
      explanation: String(topic?.explanation ?? "").trim(),
      importantPoints: asStringList(topic?.importantPoints),
      steps: asStringList(topic?.steps),
      commandsCode: asStringList(topic?.commandsCode),
      examples: asStringList(topic?.examples),
      bestPractices: asStringList(topic?.bestPractices),
      commonMistakes: asStringList(topic?.commonMistakes),
      notes: asStringList(topic?.notes),
    }))
    .filter((topic) => topic.name || topic.explanation);

  const legacySections = Array.isArray(partial.sections)
    ? partial.sections
        .map((section) => ({
          heading: String(section?.heading ?? "").trim(),
          body: String(section?.body ?? "").trim(),
          bullets: asStringList(section?.bullets),
        }))
        .filter((section) => section.heading || section.body)
    : [];

  if (!topics.length && legacySections.length) {
    topics = legacySections.map(topicFromLegacySection);
  }

  const overview =
    String(partial.overview ?? "").trim() || String(partial.summary ?? "").trim();
  const actionItems = asStringList(partial.actionItems);
  const studyTips = asStringList(partial.studyTips);
  const headline = (partial.headline ?? "").trim() || "Training Notes";

  return {
    headline,
    overview,
    learningObjectives: asStringList(partial.learningObjectives),
    topics,
    glossary: Array.isArray(partial.glossary)
      ? partial.glossary
          .map((item) => ({
            term: String(item?.term ?? "").trim(),
            definition: String(item?.definition ?? "").trim(),
          }))
          .filter((item) => item.term && item.definition)
      : [],
    questionsAndAnswers: Array.isArray(partial.questionsAndAnswers)
      ? partial.questionsAndAnswers
          .map((item) => ({
            question: String(item?.question ?? "").trim(),
            answer: String(item?.answer ?? "").trim(),
          }))
          .filter((item) => item.question && item.answer)
      : [],
    keyTakeaways: asStringList(partial.keyTakeaways),
    timestampIndex: Array.isArray(partial.timestampIndex)
      ? partial.timestampIndex
          .map((item) => ({
            timestamp: String(item?.timestamp ?? "").trim(),
            topic: String(item?.topic ?? "").trim(),
          }))
          .filter((item) => item.timestamp && item.topic)
      : [],
    actionItems,
    references: asStringList(partial.references),
    summary: overview,
    sections: topics.length ? sectionsFromTopics(topics) : legacySections,
    studyTips: studyTips.length ? studyTips : actionItems,
  };
}

export function parseNotesJson(raw: string | null | undefined): VideoNotesContent | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VideoNotesContent>;
    return normalizeNotesContent(parsed);
  } catch {
    return null;
  }
}

type OutlineTopic = {
  id: string;
  heading: string;
  focus: string;
  excerptHint: string;
  timestamp?: string | null;
};

const NOTES_SYSTEM_RULES = `You are an expert Technical Documentation Specialist converting training session transcripts into professional training notes.

Your ONLY source of information is the transcript provided.

STRICT RULES:
1. Do NOT use external knowledge.
2. Do NOT generate missing information.
3. Do NOT invent examples, code, commands, explanations, diagrams, or best practices.
4. Every statement must be directly supported by the transcript.
5. Remove filler words and conversational noise (um, uh, okay, right, basically, you know, hmm, let's see).
6. Correct grammar and sentence structure without changing meaning.
7. Merge repeated explanations into one concise explanation.
8. Preserve all technical terms exactly as spoken.
9. Preserve any code, commands, filenames, URLs, APIs, class names, function names, SQL, config values, and error messages exactly as they appear.
10. If timestamps exist, associate each topic with the appropriate timestamp.
11. Ignore greetings, introductions, attendance, jokes, and unrelated conversation unless they contribute to learning.
12. Do not summarize away important technical details.
13. Leave a field empty ("" or []) when the transcript does not support it — never invent content.`;

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
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${NOTES_SYSTEM_RULES}

Extract EVERY distinct teaching topic from this transcript chunk.
Return JSON: {
  "topics": [{ "heading": string, "focus": string, "excerptHint": string, "timestamp": string|null }]
}
Rules:
- Prefer many atomic topics over few broad ones.
- Include definitions, steps, examples, warnings, formulas, comparisons, or demos only if present in the chunk.
- timestamp: only if present in the transcript chunk; otherwise null.
- excerptHint: short phrase locating the point in the chunk.
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
        timestamp: t.timestamp ? String(t.timestamp).trim() : null,
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
}): Promise<TopicNotes> {
  const openai = getOpenAI();
  const window = input.transcript.slice(0, 16000);
  const completion = await openai.chat.completions.create({
    model: getContentModel(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${NOTES_SYSTEM_RULES}

Write professional training notes for ONE topic using only the transcript.
Return JSON: {
  "name": string,
  "timestamp": string|null,
  "explanation": string,
  "importantPoints": string[],
  "steps": string[],
  "commandsCode": string[],
  "examples": string[],
  "bestPractices": string[],
  "commonMistakes": string[],
  "notes": string[]
}
Field rules:
- explanation: clear multi-paragraph explanation (\\n\\n) based only on the transcript.
- importantPoints: bullet points supported by the transcript.
- steps: numbered process steps ONLY if described in the transcript.
- commandsCode: ONLY code/commands present in the transcript. Put each distinct snippet as its own string. Prefer multi-line blocks. You MAY prefix with language on the first line like "sql:\\nSELECT ..." or "typescript:\\nconst x = 1". Never invent code.
- In explanation text, wrap short identifiers in single backticks (like `Get-Item`), and put longer code blocks in commandsCode instead of prose.
- examples / bestPractices / commonMistakes / notes: ONLY if explicitly discussed; else [].
- timestamp: only if present; else null.
- Do not use markdown headings or emojis.`,
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
    const parsed = JSON.parse(raw) as Partial<TopicNotes>;
    return {
      name: (parsed.name ?? input.topic.heading).trim(),
      timestamp: parsed.timestamp
        ? String(parsed.timestamp).trim()
        : input.topic.timestamp || null,
      explanation: String(parsed.explanation ?? "").trim(),
      importantPoints: asStringList(parsed.importantPoints),
      steps: asStringList(parsed.steps),
      commandsCode: asStringList(parsed.commandsCode),
      examples: asStringList(parsed.examples),
      bestPractices: asStringList(parsed.bestPractices),
      commonMistakes: asStringList(parsed.commonMistakes),
      notes: asStringList(parsed.notes),
    };
  } catch {
    return {
      name: input.topic.heading,
      timestamp: input.topic.timestamp || null,
      explanation: input.topic.focus || "See the lecture recording for details on this topic.",
      importantPoints: [],
      steps: [],
      commandsCode: [],
      examples: [],
      bestPractices: [],
      commonMistakes: [],
      notes: [],
    };
  }
}

async function wrapUpNotes(input: {
  title: string;
  topic: string | null;
  topics: TopicNotes[];
  transcript: string;
}): Promise<
  Pick<
    VideoNotesContent,
    | "headline"
    | "overview"
    | "learningObjectives"
    | "keyTakeaways"
    | "glossary"
    | "questionsAndAnswers"
    | "timestampIndex"
    | "actionItems"
    | "references"
  >
> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: getContentModel(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${NOTES_SYSTEM_RULES}

Create wrap-up sections for training notes using only the transcript and topic list.
Return JSON: {
  "headline": string,
  "overview": string,
  "learningObjectives": string[],
  "keyTakeaways": string[],
  "glossary": [{ "term": string, "definition": string }],
  "questionsAndAnswers": [{ "question": string, "answer": string }],
  "timestampIndex": [{ "timestamp": string, "topic": string }],
  "actionItems": string[],
  "references": string[]
}
Field rules:
- headline: Lesson Title from the transcript/session.
- overview: concise overview based only on the transcript.
- learningObjectives: only objectives mentioned or clearly implied by the instructor.
- glossary: ONLY terms explained in the transcript.
- questionsAndAnswers: ONLY Q&A that appear in the transcript.
- timestampIndex: ONLY timestamps present in the transcript.
- actionItems: ONLY assignments/exercises/follow-ups mentioned.
- references: ONLY books/websites/tools/frameworks/docs explicitly mentioned.
- Empty arrays when unsupported. No markdown/emojis.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          title: input.title,
          topic: input.topic,
          topicNames: input.topics.map((t) => ({
            name: t.name,
            timestamp: t.timestamp,
          })),
          transcriptExcerpt: input.transcript.slice(0, 16000),
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw) as Partial<VideoNotesContent>;
    const timestampIndex = Array.isArray(parsed.timestampIndex)
      ? parsed.timestampIndex
          .map((item) => ({
            timestamp: String(item?.timestamp ?? "").trim(),
            topic: String(item?.topic ?? "").trim(),
          }))
          .filter((item) => item.timestamp && item.topic)
      : input.topics
          .filter((t) => t.timestamp)
          .map((t) => ({ timestamp: t.timestamp as string, topic: t.name }));

    return {
      headline: (parsed.headline ?? input.title).trim(),
      overview: String(parsed.overview ?? "").trim(),
      learningObjectives: asStringList(parsed.learningObjectives),
      keyTakeaways: asStringList(parsed.keyTakeaways).length
        ? asStringList(parsed.keyTakeaways)
        : input.topics.map((t) => t.name),
      glossary: Array.isArray(parsed.glossary)
        ? parsed.glossary
            .map((g) => ({
              term: String(g?.term ?? "").trim(),
              definition: String(g?.definition ?? "").trim(),
            }))
            .filter((g) => g.term && g.definition)
        : [],
      questionsAndAnswers: Array.isArray(parsed.questionsAndAnswers)
        ? parsed.questionsAndAnswers
            .map((item) => ({
              question: String(item?.question ?? "").trim(),
              answer: String(item?.answer ?? "").trim(),
            }))
            .filter((item) => item.question && item.answer)
        : [],
      timestampIndex,
      actionItems: asStringList(parsed.actionItems),
      references: asStringList(parsed.references),
    };
  } catch {
    return {
      headline: input.title,
      overview: input.topics
        .slice(0, 5)
        .map((t) => t.explanation.split(/\n\n/)[0] || t.name)
        .join("\n\n"),
      learningObjectives: [],
      keyTakeaways: input.topics.map((t) => t.name),
      glossary: [],
      questionsAndAnswers: [],
      timestampIndex: input.topics
        .filter((t) => t.timestamp)
        .map((t) => ({ timestamp: t.timestamp as string, topic: t.name })),
      actionItems: [],
      references: [],
    };
  }
}

async function notesFromTranscript(input: {
  transcript: string;
  title: string;
  topic: string | null;
  fileName: string;
  existingOutline?: OutlineTopic[] | null;
  existingTopics?: TopicNotes[] | null;
}): Promise<{ notes: VideoNotesContent; outline: OutlineTopic[] }> {
  const fallback = emptyNotes(input.title);

  if (!input.transcript || input.transcript.length < 40) {
    return {
      notes: {
        ...fallback,
        overview:
          "A full transcript was not available for this recording, so detailed training notes could not be generated yet.",
        summary:
          "A full transcript was not available for this recording, so detailed training notes could not be generated yet.",
        actionItems: ["Watch the video carefully and jot down your own key points."],
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
    const seen = new Set<string>();
    outline = outline.filter((t) => {
      const key = t.heading.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const topics: TopicNotes[] = [...(input.existingTopics ?? [])];
  const startAt = topics.length;
  const MAX_EXPAND_PER_RUN = 6;
  const toExpand = outline.slice(startAt, startAt + MAX_EXPAND_PER_RUN);
  for (const topic of toExpand) {
    topics.push(
      await expandTopic({
        topic,
        transcript: input.transcript,
        title: input.title,
      }),
    );
  }

  if (topics.length < outline.length) {
    return {
      notes: normalizeNotesContent({
        headline: input.title,
        overview: "Notes generation in progress…",
        keyTakeaways: outline.map((t) => t.heading),
        topics,
      }),
      outline,
    };
  }

  const wrap = await wrapUpNotes({
    title: input.title,
    topic: input.topic,
    topics,
    transcript: input.transcript,
  });

  return {
    notes: normalizeNotesContent({
      ...wrap,
      topics,
    }),
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

    const title = row?.title?.trim() || cleanFileName(row?.fileName || "") || "Training Notes";
    let existingOutline: OutlineTopic[] | null = null;
    let existingTopics: TopicNotes[] | null = null;
    if (!input.force && row?.notesOutlineJson) {
      try {
        existingOutline = JSON.parse(row.notesOutlineJson) as OutlineTopic[];
      } catch {
        existingOutline = null;
      }
    }
    if (!input.force && row?.notesJson) {
      const partial = parseNotesJson(row.notesJson);
      if (partial?.topics?.length) existingTopics = partial.topics;
    }

    const { notes, outline } = await notesFromTranscript({
      transcript,
      title,
      topic: row?.topic ?? null,
      fileName: row?.fileName || "Meeting Recording",
      existingOutline,
      existingTopics,
    });

    const complete = outline.length > 0 && notes.topics.length >= outline.length;

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

  if (input.notes.overview || input.notes.summary) {
    drawParagraph("Overview", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    drawParagraph(input.notes.overview || input.notes.summary, { size: 11, gap: 15 });
    y -= 8;
  }

  if (input.notes.learningObjectives.length) {
    drawParagraph("Learning Objectives", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const item of input.notes.learningObjectives) {
      drawParagraph(`•  ${item}`, { size: 11, gap: 14, charsPerLine: 84 });
    }
    y -= 8;
  }

  if (input.notes.keyTakeaways.length) {
    drawParagraph("Key Takeaways", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const item of input.notes.keyTakeaways) {
      drawParagraph(`•  ${item}`, { size: 11, gap: 14, charsPerLine: 84 });
    }
    y -= 8;
  }

  const topics =
    input.notes.topics.length > 0
      ? input.notes.topics
      : input.notes.sections.map((section) => ({
          name: section.heading,
          timestamp: null as string | null,
          explanation: section.body,
          importantPoints: section.bullets ?? [],
          steps: [] as string[],
          commandsCode: [] as string[],
          examples: [] as string[],
          bestPractices: [] as string[],
          commonMistakes: [] as string[],
          notes: [] as string[],
        }));

  for (const topic of topics) {
    const heading = topic.timestamp ? `${topic.name} (${topic.timestamp})` : topic.name;
    if (heading) {
      drawParagraph(heading, { size: 13, bold: true, charsPerLine: 72, gap: 17 });
    }
    if (topic.explanation) {
      drawParagraph("Explanation", { size: 11, bold: true, gap: 14, charsPerLine: 84 });
      drawParagraph(topic.explanation, { size: 11, gap: 15 });
    }
    const lists: Array<[string, string[]]> = [
      ["Important Points", topic.importantPoints],
      ["Steps or Process", topic.steps],
      ["Commands / Code", topic.commandsCode],
      ["Examples Mentioned", topic.examples],
      ["Best Practices", topic.bestPractices],
      ["Common Mistakes", topic.commonMistakes],
      ["Notes", topic.notes],
    ];
    for (const [label, items] of lists) {
      if (!items.length) continue;
      drawParagraph(label, { size: 11, bold: true, gap: 14, charsPerLine: 84 });
      items.forEach((item, index) => {
        const prefix = label === "Steps or Process" ? `${index + 1}.  ` : "•  ";
        drawParagraph(`${prefix}${item}`, { size: 11, gap: 14, charsPerLine: 84 });
      });
    }
    y -= 6;
  }

  if (input.notes.glossary.length) {
    drawParagraph("Definitions", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const item of input.notes.glossary) {
      drawParagraph(`${item.term}: ${item.definition}`, { size: 11, gap: 14 });
    }
    y -= 6;
  }

  if (input.notes.questionsAndAnswers.length) {
    drawParagraph("Questions and Answers", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const item of input.notes.questionsAndAnswers) {
      drawParagraph(`Q: ${item.question}`, { size: 11, bold: true, gap: 14 });
      drawParagraph(`A: ${item.answer}`, { size: 11, gap: 14 });
    }
    y -= 6;
  }

  if (input.notes.timestampIndex.length) {
    drawParagraph("Timestamp Index", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const item of input.notes.timestampIndex) {
      drawParagraph(`${item.timestamp} — ${item.topic}`, { size: 11, gap: 14 });
    }
    y -= 6;
  }

  if (input.notes.actionItems.length || input.notes.studyTips.length) {
    drawParagraph("Action Items", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const tip of input.notes.actionItems.length
      ? input.notes.actionItems
      : input.notes.studyTips) {
      drawParagraph(`•  ${tip}`, { size: 11, gap: 14, charsPerLine: 84 });
    }
    y -= 6;
  }

  if (input.notes.references.length) {
    drawParagraph("References", { size: 14, bold: true, charsPerLine: 70, gap: 18 });
    for (const ref of input.notes.references) {
      drawParagraph(`•  ${ref}`, { size: 11, gap: 14, charsPerLine: 84 });
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

  if (input.notes.overview || input.notes.summary) {
    addHeading("Overview");
    addBody(input.notes.overview || input.notes.summary);
  }

  if (input.notes.learningObjectives.length) {
    addHeading("Learning Objectives");
    input.notes.learningObjectives.forEach(addBullet);
  }

  if (input.notes.keyTakeaways.length) {
    addHeading("Key Takeaways");
    input.notes.keyTakeaways.forEach(addBullet);
  }

  const topics =
    input.notes.topics.length > 0
      ? input.notes.topics
      : input.notes.sections.map((section) => ({
          name: section.heading,
          timestamp: null as string | null,
          explanation: section.body,
          importantPoints: section.bullets ?? [],
          steps: [] as string[],
          commandsCode: [] as string[],
          examples: [] as string[],
          bestPractices: [] as string[],
          commonMistakes: [] as string[],
          notes: [] as string[],
        }));

  for (const topic of topics) {
    children.push(
      new Paragraph({
        text: topic.timestamp ? `${topic.name} (${topic.timestamp})` : topic.name,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 100 },
      }),
    );
    if (topic.explanation) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Explanation", bold: true, size: 22 })],
          spacing: { after: 80 },
        }),
      );
      addBody(topic.explanation);
    }
    const lists: Array<[string, string[], boolean]> = [
      ["Important Points", topic.importantPoints, false],
      ["Steps or Process", topic.steps, true],
      ["Commands / Code", topic.commandsCode, false],
      ["Examples Mentioned", topic.examples, false],
      ["Best Practices", topic.bestPractices, false],
      ["Common Mistakes", topic.commonMistakes, false],
      ["Notes", topic.notes, false],
    ];
    for (const [label, items, numbered] of lists) {
      if (!items.length) continue;
      children.push(
        new Paragraph({
          children: [new TextRun({ text: label, bold: true, size: 22 })],
          spacing: { before: 120, after: 80 },
        }),
      );
      items.forEach((item, index) => {
        if (numbered) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `${index + 1}. ${item}`, size: 22 })],
              spacing: { after: 80 },
            }),
          );
        } else {
          addBullet(item);
        }
      });
    }
  }

  if (input.notes.glossary.length) {
    addHeading("Definitions");
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

  if (input.notes.questionsAndAnswers.length) {
    addHeading("Questions and Answers");
    for (const item of input.notes.questionsAndAnswers) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Q: ${item.question}`, bold: true, size: 22 })],
          spacing: { after: 60 },
        }),
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `A: ${item.answer}`, size: 22 })],
          spacing: { after: 120 },
        }),
      );
    }
  }

  if (input.notes.timestampIndex.length) {
    addHeading("Timestamp Index");
    for (const item of input.notes.timestampIndex) {
      addBullet(`${item.timestamp} — ${item.topic}`);
    }
  }

  if (input.notes.actionItems.length || input.notes.studyTips.length) {
    addHeading("Action Items");
    (input.notes.actionItems.length
      ? input.notes.actionItems
      : input.notes.studyTips
    ).forEach(addBullet);
  }

  if (input.notes.references.length) {
    addHeading("References");
    input.notes.references.forEach(addBullet);
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
