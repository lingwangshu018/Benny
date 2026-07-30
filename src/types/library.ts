export type CharacterKind = "character" | "npc" | "user";
export type ContextScope = "global" | "character" | "module";
export type TriggerMode = "always" | "keyword" | "manual";
export type InjectionPosition =
  | "before-character"
  | "after-character"
  | "author-note"
  | "chat-depth";

export interface LibraryRecord {
  id: string;
  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
}

export interface CharacterCard extends LibraryRecord {
  name: string;
  remark: string;
  kind: CharacterKind;
  summary: string;
  prompt: string;
  scenario: string;
  greeting: string;
  exampleDialogue: string;
  tags: string[];
  avatar: string;
  voice: string;
  enabled: boolean;
  worldbookIds: string[];
  userPersonaId: string;
  defaultPresetId: string;
  contextLimit: number;
}

export interface WorldbookEntry extends LibraryRecord {
  title: string;
  content: string;
  category: string;
  enabled: boolean;
  triggerMode: TriggerMode;
  keywords: string[];
  keywordLogic: "any" | "all";
  caseSensitive: boolean;
  scope: ContextScope;
  scopeIds: string[];
  injectionPosition: InjectionPosition;
  priority: number;
  probability: number;
}

export interface PromptPreset extends LibraryRecord {
  title: string;
  description: string;
  content: string;
  category: string;
  enabled: boolean;
  scope: ContextScope;
  scopeIds: string[];
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
  historyLimit: number;
  memoryLimit: number;
}

export interface LibrarySnapshot {
  schemaVersion: 1;
  exportedAt: number;
  characters: CharacterCard[];
  worldbooks: WorldbookEntry[];
  presets: PromptPreset[];
}
