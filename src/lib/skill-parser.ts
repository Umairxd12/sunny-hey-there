// Client-safe SKILL.md validation and parsing (used for upload checks and preview only).

export const SKILL_MAX_BYTES = 500_000;

export interface ParsedSkill {
  title: string;
  headings: { level: number; text: string }[];
  words: number;
  lines: number;
}

export function validateSkillFile(file: File): string | null {
  if (!/\.md$/i.test(file.name)) return "Please upload a Markdown (.md) file.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > SKILL_MAX_BYTES) return "File is too large (max 500 KB).";
  return null;
}

export function parseSkill(content: string): { parsed: ParsedSkill; error: string | null } {
  const lines = content.split(/\r?\n/);
  const headings = lines
    .map((l) => /^(#{1,6})\s+(.+?)\s*#*$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ level: (m[1] ?? "#").length, text: m[2] ?? "" }));
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const parsed: ParsedSkill = { title: headings[0]?.text ?? "Video production skill", headings, words, lines: lines.length };
  if (!content.trim()) return { parsed, error: "This file is empty." };
  if (!headings.length) return { parsed, error: "No Markdown headings found. A SKILL.md needs at least one # heading." };
  if (words < 30) return { parsed, error: "This file looks too short to be a full skill (under 30 words)." };
  if (content.includes("\u0000")) return { parsed, error: "This doesn't look like a text file." };
  return { parsed, error: null };
}
