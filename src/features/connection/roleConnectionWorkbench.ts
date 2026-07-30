import { buildContext } from "../../context/contextBuilder";
import type { ContextBundle, ContextRequest } from "../../types/context";
import type {
  CharacterCard,
  LibrarySnapshot,
  PromptPreset,
  WorldbookEntry,
} from "../../types/library";
import type { CharacterMemory } from "../../types/memory";

export interface RoleConnectionDraft {
  characterId: string;
  userPersonaId: string;
  presetId: string;
  worldbookIds: string[];
}

export interface ConnectionCheck {
  id: "profile" | "persona" | "preset" | "worldbooks";
  label: string;
  description: string;
  complete: boolean;
  required: boolean;
}

export interface RoleConnectionSummary {
  character: CharacterCard;
  score: number;
  ready: boolean;
  status: "待补充" | "可以连接" | "连接完整";
  checks: ConnectionCheck[];
}

export interface RoleConnectionInspection extends RoleConnectionSummary {
  draft: RoleConnectionDraft;
  bundle: ContextBundle;
  inactiveWorldbooks: WorldbookEntry[];
  selectedPersona: CharacterCard | null;
  selectedPreset: PromptPreset | null;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function characterFor(snapshot: LibrarySnapshot, characterId: string) {
  return (
    snapshot.characters.find(
      (character) =>
        character.id === characterId &&
        character.kind !== "user" &&
        character.enabled,
    ) ?? null
  );
}

function validPersona(snapshot: LibrarySnapshot, personaId: string) {
  return (
    snapshot.characters.find(
      (character) =>
        character.id === personaId &&
        character.kind === "user" &&
        character.enabled,
    ) ?? null
  );
}

function validPreset(
  snapshot: LibrarySnapshot,
  presetId: string,
  characterId: string,
) {
  return (
    snapshot.presets.find(
      (preset) =>
        preset.id === presetId &&
        preset.enabled &&
        (preset.scope === "global" ||
          (preset.scope === "character" &&
            preset.scopeIds.includes(characterId)) ||
          (preset.scope === "module" && preset.scopeIds.includes("chat"))),
    ) ?? null
  );
}

function checksFor(
  character: CharacterCard,
  persona: CharacterCard | null,
  preset: PromptPreset | null,
  worldbookIds: string[],
): ConnectionCheck[] {
  return [
    {
      id: "profile",
      label: "角色核心",
      description: "至少填写角色设定或简介",
      complete: Boolean(character.prompt.trim() || character.summary.trim()),
      required: true,
    },
    {
      id: "persona",
      label: "用户人设",
      description: "让角色知道正在和谁说话",
      complete: Boolean(persona),
      required: false,
    },
    {
      id: "preset",
      label: "默认预设",
      description: "确定聊天规则、文风与生成参数",
      complete: Boolean(preset),
      required: false,
    },
    {
      id: "worldbooks",
      label: "世界书",
      description: "为角色补充世界与关系设定",
      complete: worldbookIds.length > 0,
      required: false,
    },
  ];
}

function summary(
  character: CharacterCard,
  persona: CharacterCard | null,
  preset: PromptPreset | null,
  worldbookIds: string[],
): RoleConnectionSummary {
  const checks = checksFor(character, persona, preset, worldbookIds);
  const score = Math.round(
    (checks.filter((check) => check.complete).length / checks.length) * 100,
  );
  const ready = checks
    .filter((check) => check.required)
    .every((check) => check.complete);
  return {
    character,
    score,
    ready,
    status:
      score === 100 ? "连接完整" : ready ? "可以连接" : "待补充",
    checks,
  };
}

function normalizeDraft(
  snapshot: LibrarySnapshot,
  draft: RoleConnectionDraft,
): RoleConnectionDraft {
  const persona = validPersona(snapshot, draft.userPersonaId);
  const preset = validPreset(
    snapshot,
    draft.presetId,
    draft.characterId,
  );
  const existingBookIds = new Set(
    snapshot.worldbooks
      .filter((worldbook) => worldbook.enabled)
      .map((worldbook) => worldbook.id),
  );
  return {
    characterId: draft.characterId,
    userPersonaId: persona?.id ?? "",
    presetId: preset?.id ?? "",
    worldbookIds: unique(draft.worldbookIds).filter((id) =>
      existingBookIds.has(id),
    ),
  };
}

function initialDraft(character: CharacterCard): RoleConnectionDraft {
  return {
    characterId: character.id,
    userPersonaId: character.userPersonaId,
    presetId: character.defaultPresetId,
    worldbookIds: [...character.worldbookIds],
  };
}

export const roleConnectionWorkbench = {
  presets(snapshot: LibrarySnapshot, characterId: string): PromptPreset[] {
    return snapshot.presets.filter(
      (preset) =>
        Boolean(validPreset(snapshot, preset.id, characterId)),
    );
  },

  list(snapshot: LibrarySnapshot): RoleConnectionSummary[] {
    return snapshot.characters
      .filter(
        (character) => character.kind !== "user" && character.enabled,
      )
      .map((character) => {
        const draft = normalizeDraft(snapshot, initialDraft(character));
        return summary(
          character,
          validPersona(snapshot, draft.userPersonaId),
          validPreset(snapshot, draft.presetId, character.id),
          draft.worldbookIds,
        );
      });
  },

  draft(snapshot: LibrarySnapshot, characterId: string): RoleConnectionDraft {
    const character = characterFor(snapshot, characterId);
    if (!character) {
      return {
        characterId: "",
        userPersonaId: "",
        presetId: "",
        worldbookIds: [],
      };
    }
    return normalizeDraft(snapshot, initialDraft(character));
  },

  inspect(
    snapshot: LibrarySnapshot,
    draftInput: RoleConnectionDraft,
    message: string,
    memories: CharacterMemory[] = [],
  ): RoleConnectionInspection | null {
    const draft = normalizeDraft(snapshot, draftInput);
    const character = characterFor(snapshot, draft.characterId);
    if (!character) return null;
    const selectedPersona = validPersona(snapshot, draft.userPersonaId);
    const selectedPreset = validPreset(
      snapshot,
      draft.presetId,
      character.id,
    );
    const previewCharacter: CharacterCard = {
      ...character,
      userPersonaId: draft.userPersonaId,
      defaultPresetId: draft.presetId,
      worldbookIds: draft.worldbookIds,
    };
    const manualWorldbookIds = snapshot.worldbooks
      .filter(
        (worldbook) =>
          draft.worldbookIds.includes(worldbook.id) &&
          worldbook.triggerMode === "manual",
      )
      .map((worldbook) => worldbook.id);
    const request: ContextRequest = {
      characterId: character.id,
      presetId: draft.presetId,
      moduleId: "chat",
      message,
      manualWorldbookIds,
    };
    const previewSnapshot = {
      ...snapshot,
      characters: snapshot.characters.map((item) =>
        item.id === previewCharacter.id ? previewCharacter : item,
      ),
      memories,
    };
    const bundle = buildContext(previewSnapshot, request, {
      memoryLimit: selectedPreset?.memoryLimit || 6,
    });
    const includedBookIds = new Set(
      bundle.worldbooks.map((worldbook) => worldbook.id),
    );
    const inactiveWorldbooks = snapshot.worldbooks.filter(
      (worldbook) =>
        draft.worldbookIds.includes(worldbook.id) &&
        worldbook.enabled &&
        !includedBookIds.has(worldbook.id),
    );
    return {
      ...summary(
        previewCharacter,
        selectedPersona,
        selectedPreset,
        draft.worldbookIds,
      ),
      draft,
      bundle,
      inactiveWorldbooks,
      selectedPersona,
      selectedPreset,
    };
  },

  apply(
    snapshot: LibrarySnapshot,
    draftInput: RoleConnectionDraft,
  ): {
    characters: CharacterCard[];
    session: ContextRequest;
    character: CharacterCard;
  } {
    const draft = normalizeDraft(snapshot, draftInput);
    const character = characterFor(snapshot, draft.characterId);
    if (!character) throw new Error("没有找到可以连接的角色");
    const updatedCharacter: CharacterCard = {
      ...character,
      userPersonaId: draft.userPersonaId,
      defaultPresetId: draft.presetId,
      worldbookIds: draft.worldbookIds,
      updatedAt: Date.now(),
    };
    const manualWorldbookIds = snapshot.worldbooks
      .filter(
        (worldbook) =>
          draft.worldbookIds.includes(worldbook.id) &&
          worldbook.triggerMode === "manual",
      )
      .map((worldbook) => worldbook.id);
    return {
      characters: snapshot.characters.map((item) =>
        item.id === updatedCharacter.id ? updatedCharacter : item,
      ),
      character: updatedCharacter,
      session: {
        characterId: updatedCharacter.id,
        presetId: updatedCharacter.defaultPresetId,
        moduleId: "chat",
        message: "",
        manualWorldbookIds,
      },
    };
  },
};
