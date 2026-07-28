"use client";

import { useMemo, useState } from "react";

type Props = {
  code: string;
  language?: string | null;
  title?: string | null;
  className?: string;
};

function guessLanguage(code: string, hint?: string | null): string {
  const fromHint = (hint || "").trim().toLowerCase();
  if (fromHint) return fromHint;
  const sample = code.trim();
  if (/^(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER)\b/i.test(sample)) return "sql";
  if (/^(npm|npx|yarn|pnpm|pip|python|node|curl|git|cd|mkdir|docker)\b/i.test(sample)) {
    return "shell";
  }
  if (/^\s*[{[]/.test(sample) || /"\w+"\s*:/.test(sample)) return "json";
  if (/<\/?[a-z][\w-]*>/i.test(sample)) return "html";
  if (/^(import|export|const|let|var|function|class|interface|type)\b/m.test(sample)) {
    return "typescript";
  }
  if (/^(def|class|from|import)\b/m.test(sample) && /:\s*$/m.test(sample)) return "python";
  if (/^(public|private|class|void|static)\b/m.test(sample)) return "java";
  return "code";
}

/** Parse optional `lang:` / ```lang fences from a commandsCode entry. */
export function parseCodeSnippet(raw: string): { language: string; code: string; title: string } {
  let text = raw.replace(/\r\n/g, "\n").trim();
  let language = "";
  let title = "Code";

  const fence = text.match(/^```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```$/);
  if (fence) {
    language = fence[1] || "";
    text = fence[2].replace(/\n$/, "");
  } else {
    const langLine = text.match(/^([a-zA-Z0-9_+-]+):\n([\s\S]+)$/);
    if (langLine && langLine[2].includes("\n")) {
      language = langLine[1];
      text = langLine[2];
    }
  }

  const resolved = guessLanguage(text, language);
  if (resolved === "shell") title = "Terminal";
  else if (resolved === "sql") title = "SQL";
  else if (resolved === "json") title = "JSON";
  else title = resolved === "code" ? "Code" : resolved;

  return { language: resolved, code: text, title };
}

export function looksLikeCode(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^```/.test(t)) return true;
  if (t.includes("\n") && /[{};=]|=>|SELECT\b|npm |pip |curl |def |function |class /i.test(t)) {
    return true;
  }
  if (
    t.length < 220 &&
    /^(npm|npx|yarn|pnpm|pip|python|node|curl|git|docker|SELECT|INSERT|UPDATE|DELETE)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

export default function NotesCodeEditor({ code, language, title, className }: Props) {
  const parsed = useMemo(
    () => parseCodeSnippet(code),
    [code],
  );
  const lang = language || parsed.language;
  const body = parsed.code;
  const label = title || parsed.title;
  const lines = body.length ? body.split("\n") : [""];
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }

  return (
    <div className={`notes-code-editor ${className || ""}`.trim()}>
      <div className="notes-code-editor-chrome">
        <div className="notes-code-editor-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="notes-code-editor-meta">
          <span className="notes-code-editor-title">{label}</span>
          <span className="notes-code-editor-lang">{lang}</span>
        </div>
        <button type="button" className="notes-code-editor-copy" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="notes-code-editor-body" role="region" aria-label={`${label} editor`}>
        <div className="notes-code-editor-gutter" aria-hidden>
          {lines.map((_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <pre className="notes-code-editor-pre">
          <code>{body}</code>
        </pre>
      </div>
    </div>
  );
}
