import type { MemoryFileV1 } from "./contract.ts";

export interface MarkdownMemoryEntry {
  key: string;
  lineNumber: number;
  before: string;
  display: string;
  summary: string;
  actionable: boolean;
}

export interface MarkdownMemorySection {
  key: string;
  path: MemoryFileV1["path"];
  level: number;
  title: string;
  lineNumber: number;
  entries: MarkdownMemoryEntry[];
  children: MarkdownMemorySection[];
}

export interface ParsedMemoryDocument {
  document: MemoryFileV1;
  roots: MarkdownMemorySection[];
  orphanEntries: MarkdownMemoryEntry[];
  sections: MarkdownMemorySection[];
}

export function parseMemoryDocument(
  document: MemoryFileV1,
): ParsedMemoryDocument {
  const lines = document.content.split(/\r?\n/);
  const roots: MarkdownMemorySection[] = [];
  const allSections: MarkdownMemorySection[] = [];
  const orphanEntries: MarkdownMemoryEntry[] = [];
  const stack: MarkdownMemorySection[] = [];
  let inFence = false;
  let inComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (inComment) {
      if (trimmed.includes("-->")) inComment = false;
      continue;
    }
    if (trimmed.startsWith("<!--")) {
      if (!trimmed.includes("-->")) inComment = true;
      continue;
    }

    const heading = inFence ? null : parseAtxHeading(line);
    if (heading) {
      const section: MarkdownMemorySection = {
        key: `${document.path}:${index + 1}`,
        path: document.path,
        level: heading.level,
        title: heading.title,
        lineNumber: index + 1,
        entries: [],
        children: [],
      };
      while (
        stack.length > 0 &&
        (stack[stack.length - 1]?.level ?? 0) >= section.level
      ) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(section);
      else roots.push(section);
      stack.push(section);
      allSections.push(section);
      continue;
    }

    const isFence = /^(```|~~~)/.test(trimmed);
    if (isFence) inFence = !inFence;
    const entry = createEntry(
      document,
      line,
      index,
      lines,
      !inFence && !isFence,
    );
    const owner = stack[stack.length - 1];
    if (owner) owner.entries.push(entry);
    else orphanEntries.push(entry);
  }

  return {
    document,
    roots,
    orphanEntries,
    sections: allSections,
  };
}

export function summaryText(line: string, maxLength = 96): string {
  const display = displayMemoryLine(line).replace(/\s+/g, " ").trim();
  const characters = Array.from(display || line.trim());
  if (characters.length <= maxLength) return characters.join("");
  return `${characters.slice(0, maxLength).join("")}…`;
}

export function displayMemoryLine(line: string): string {
  const prefix = memoryLinePrefix(line);
  return line.slice(prefix.length) || line;
}

function createEntry(
  document: MemoryFileV1,
  line: string,
  index: number,
  lines: string[],
  actionable: boolean,
): MarkdownMemoryEntry {
  const exactCount = lines.filter((item) => item === line).length;
  return {
    key: `${document.path}:${index + 1}`,
    lineNumber: index + 1,
    before: line,
    display: displayMemoryLine(line),
    summary: summaryText(line),
    actionable: actionable && exactCount === 1 && !isInternalMarker(line.trim()),
  };
}

function parseAtxHeading(
  line: string,
): { level: number; title: string } | null {
  const match = /^\s{0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(line);
  if (!match?.[1]) return null;
  const title = (match[2] ?? "").trim();
  if (!title) return null;
  return { level: match[1].length, title };
}

function memoryLinePrefix(line: string): string {
  const listPrefix = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)/);
  if (listPrefix?.[1]) return listPrefix[1];
  return line.match(/^\s*/)?.[0] ?? "";
}

function isInternalMarker(line: string): boolean {
  return line.startsWith("<!--") || line.startsWith("-->");
}
