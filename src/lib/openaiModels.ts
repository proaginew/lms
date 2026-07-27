/**
 * Flagship text model for exhaustive lecture notes + quizzes.
 * Override with OPENAI_CONTENT_MODEL if your account has a newer slug (e.g. gpt-5.6).
 */
export function getContentModel() {
  return process.env.OPENAI_CONTENT_MODEL?.trim() || "gpt-4.1";
}

/** Lightweight model for title/topic labeling only. */
export function getMetaModel() {
  return process.env.OPENAI_META_MODEL?.trim() || "gpt-4o-mini";
}
