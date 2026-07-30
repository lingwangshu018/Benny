export type MemoryKind =
  | "event"
  | "relationship"
  | "preference"
  | "promise"
  | "unresolved"
  | "other";

export type MemorySource = "manual" | "chat" | "module";

export interface CharacterMemory {
  id: string;
  schemaVersion: 1;
  characterId: string;
  kind: MemoryKind;
  title: string;
  content: string;
  keywords: string[];
  importance: number;
  pinned: boolean;
  enabled: boolean;
  source: MemorySource;
  sourceId: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryCandidate {
  kind: MemoryKind;
  title: string;
  content: string;
  keywords: string[];
  importance: number;
}
