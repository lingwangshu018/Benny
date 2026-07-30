export interface MemoryVector {
  memoryId: string;
  characterId: string;
  modelKey: string;
  contentFingerprint: string;
  embedding: number[];
  updatedAt: number;
}

export interface HybridMemoryResult {
  memories: import("./memory").CharacterMemory[];
  mode: "hybrid" | "keyword";
  indexedCount: number;
  fallbackReason: string;
}
