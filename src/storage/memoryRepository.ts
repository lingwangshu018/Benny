import type { CharacterMemory, MemoryCandidate } from "../types/memory";
import { readJson, writeJson } from "./localStorage";

const KEY = "aether.characterMemories";
const CHANGE_EVENT = "aether-memory-change";

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function all(): CharacterMemory[] {
  return readJson<CharacterMemory[]>(KEY, []);
}

export const memoryRepository = {
  changeEvent: CHANGE_EVENT,

  all(): CharacterMemory[] {
    return all();
  },

  forCharacter(characterId: string): CharacterMemory[] {
    return all()
      .filter((memory) => memory.characterId === characterId)
      .sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          right.importance - left.importance ||
          right.updatedAt - left.updatedAt,
      );
  },

  create(characterId: string): CharacterMemory {
    const timestamp = Date.now();
    return {
      id: `memory_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: 1,
      characterId,
      kind: "event",
      title: "",
      content: "",
      keywords: [],
      importance: 3,
      pinned: false,
      enabled: true,
      source: "manual",
      sourceId: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  },

  save(memory: CharacterMemory) {
    const memories = all();
    const normalized = {
      ...memory,
      title: memory.title.trim(),
      content: memory.content.trim(),
      keywords: [...new Set(memory.keywords.map((item) => item.trim()).filter(Boolean))],
      importance: Math.max(1, Math.min(5, Number(memory.importance) || 1)),
      updatedAt: Date.now(),
    };
    writeJson(
      KEY,
      memories.some((item) => item.id === normalized.id)
        ? memories.map((item) => (item.id === normalized.id ? normalized : item))
        : [normalized, ...memories],
    );
    notify();
    return normalized;
  },

  remove(memoryId: string) {
    writeJson(
      KEY,
      all().filter((memory) => memory.id !== memoryId),
    );
    notify();
  },

  mergeExtracted(
    characterId: string,
    candidates: MemoryCandidate[],
    sourceId: string,
  ) {
    const memories = all();
    let created = 0;
    let updated = 0;
    for (const candidate of candidates) {
      const title = candidate.title.trim();
      const content = candidate.content.trim();
      if (!title || !content) continue;
      const existingIndex = memories.findIndex(
        (memory) =>
          memory.characterId === characterId &&
          (memory.title.trim().toLocaleLowerCase() ===
            title.toLocaleLowerCase() ||
            memory.content.trim() === content),
      );
      if (existingIndex >= 0) {
        const existing = memories[existingIndex];
        memories[existingIndex] = {
          ...existing,
          kind: candidate.kind,
          content:
            content.length > existing.content.length ? content : existing.content,
          keywords: [
            ...new Set([...existing.keywords, ...candidate.keywords]),
          ],
          importance: Math.max(existing.importance, candidate.importance),
          enabled: true,
          source: "chat",
          sourceId,
          updatedAt: Date.now(),
        };
        updated += 1;
        continue;
      }
      const memory = this.create(characterId);
      memories.unshift({
        ...memory,
        kind: candidate.kind,
        title,
        content,
        keywords: [...new Set(candidate.keywords)],
        importance: Math.max(1, Math.min(5, candidate.importance)),
        source: "chat",
        sourceId,
      });
      created += 1;
    }
    if (created || updated) {
      writeJson(KEY, memories);
      notify();
    }
    return { created, updated };
  },
};
