import type { MarkdownMemorySection } from "./markdown.ts";

/** Flat presentation list only. Source sections and entry identities stay intact. */
export function groupAutomaticDateSections(
  sections: readonly MarkdownMemorySection[],
): MarkdownMemorySection[] {
  const result: MarkdownMemorySection[] = [];
  const groups = new Map<string, MarkdownMemorySection>();
  const parents: MarkdownMemorySection[] = [];
  for (const section of sections) {
    while (parents.length &&
      (parents[parents.length - 1]!.path !== section.path ||
        parents[parents.length - 1]!.level >= section.level)) {
      parents.pop();
    }
    const date = automaticDate(section.title);
    const scope = JSON.stringify([
      section.path, parents[parents.length - 1]?.key ?? null, section.level, date,
    ]);
    const existing = date ? groups.get(scope) : undefined;
    if (existing) {
      existing.entries.push(...section.entries);
    } else {
      const display = { ...section, entries: [...section.entries] };
      result.push(display);
      if (date) groups.set(scope, display);
    }
    // Track original hierarchy, not merged display keys, to preserve custom scopes.
    parents.push(section);
  }
  return result;
}

function automaticDate(title: string): string | null {
  const match = /^自动整理\s*·\s*(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(title);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!) return null;
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
