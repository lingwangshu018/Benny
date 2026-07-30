import type {
  CharacterCard,
  InjectionPosition,
  LibrarySnapshot,
  PromptPreset,
  WorldbookEntry,
} from "./library";
import type { CharacterMemory } from "./memory";

export interface ContextRequest {
  characterId: string;
  presetId: string;
  moduleId: string;
  message: string;
  manualWorldbookIds: string[];
}

export interface ContextSection {
  position: InjectionPosition | "preset" | "character" | "memory";
  title: string;
  content: string;
  sourceId: string;
  sourceType: "preset" | "character" | "worldbook" | "memory";
}

export interface ContextBundle {
  character: CharacterCard | null;
  preset: PromptPreset | null;
  worldbooks: WorldbookEntry[];
  memories: CharacterMemory[];
  sections: ContextSection[];
  promptPreview: string;
  characterCount: number;
}

export interface ContextSource {
  snapshot(): LibrarySnapshot;
}

export interface ContextBuildOptions {
  memoryLimit?: number;
  selectedMemories?: CharacterMemory[];
}
