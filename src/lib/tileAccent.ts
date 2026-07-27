/** Stable accent index from a string (course/video id or name). */
export function accentIndex(seed: string, count = 6): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}

export function accentClass(seed: string): string {
  return `yt-accent-${accentIndex(seed)}`;
}
