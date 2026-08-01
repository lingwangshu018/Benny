import type {
  CharacterCard,
  InjectionPosition,
  LibrarySnapshot,
  PromptPreset,
  WorldbookEntry,
} from "./library";
import type { CharacterMemory } from "./memory";
import type { LifeEvent } from "./life";
import type { RelationshipProfile } from "./relationship";

export interface ContextRequest {
  characterId: string;
  presetId: string;
  moduleId: string;
  message: string;
  manualWorldbookIds: string[];
}

export interface ContextSection {
  position:
    | InjectionPosition
    | "preset"
    | "character"
    | "relationship"
    | "memory"
    | "timeline";
  title: string;
  content: string;
  sourceId: string;
  sourceType:
    | "preset"
    | "character"
    | "relationship"
    | "worldbook"
    | "memory"
    | "life-event";
}

export type WorldbookEvaluationReason =
  | "always"
  | "manual-selected"
  | "manual-not-selected"
  | "keyword-match"
  | "keywords-empty"
  | "keywords-no-match"
  | "keywords-partial"
  | "probability-miss"
  | "disabled";

export interface WorldbookEvaluation {
  worldbook: WorldbookEntry;
  included: boolean;
  reason: WorldbookEvaluationReason;
  matchedKeywords: string[];
  missingKeywords: string[];
}

export interface ContextBundle {
  character: CharacterCard | null;
  userPersona: CharacterCard | null;
  preset: PromptPreset | null;
  worldbooks: WorldbookEntry[];
  worldbookEvaluations: WorldbookEvaluation[];
  memories: CharacterMemory[];
  lifeEvents: LifeEvent[];
  relationshipProfile: RelationshipProfile | null;
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
  selectedLifeEvents?: LifeEvent[];
  relationshipProfile?: RelationshipProfile | null;
}
