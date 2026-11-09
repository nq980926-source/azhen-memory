export type TopLevelMemorySection = "pending" | "current" | "history";

export class SessionFoldState {
  private readonly topLevel: Record<TopLevelMemorySection, boolean> = {
    pending: false,
    current: true,
    history: false,
  };
  private readonly sections = new Set<string>();
  private readonly candidates = new Set<string>();
  private readonly entries = new Set<string>();
  private readonly events = new Set<string>();

  isTopLevelOpen(section: TopLevelMemorySection): boolean {
    return this.topLevel[section];
  }

  setTopLevelOpen(section: TopLevelMemorySection, open: boolean): void {
    this.topLevel[section] = open;
  }

  isSectionOpen(key: string): boolean {
    return this.sections.has(key);
  }

  setSectionOpen(key: string, open: boolean): void {
    setMembership(this.sections, key, open);
  }

  isCandidateOpen(id: string): boolean {
    return this.candidates.has(id);
  }

  setCandidateOpen(id: string, open: boolean): void {
    setMembership(this.candidates, id, open);
  }

  isEntryOpen(key: string): boolean {
    return this.entries.has(key);
  }

  setEntryOpen(key: string, open: boolean): void {
    setMembership(this.entries, key, open);
  }

  isEventOpen(id: string): boolean {
    return this.events.has(id);
  }

  setEventOpen(id: string, open: boolean): void {
    setMembership(this.events, id, open);
  }
}

function setMembership(
  set: Set<string>,
  key: string,
  open: boolean,
): void {
  if (open) set.add(key);
  else set.delete(key);
}
