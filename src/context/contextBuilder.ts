import type {
  ContextBuildOptions,
  ContextBundle,
  ContextRequest,
  ContextSection,
} from "../types/context";
import type {
  CharacterCard,
  ContextScope,
  PromptPreset,
  WorldbookEntry,
} from "../types/library";
import type { CharacterMemory } from "../types/memory";
import { memoryEngine } from "../memory/memoryEngine";

function scopeMatches(
  scope: ContextScope,
  scopeIds: string[],
  characterId: string,
  moduleId: string,
) {
  if (scope === "global") return true;
  if (scope === "character") return scopeIds.includes(characterId);
  return Boolean(moduleId) && scopeIds.includes(moduleId);
}

function presetMatches(
  preset: PromptPreset,
  request: ContextRequest,
) {
  return (
    preset.enabled &&
    scopeMatches(
      preset.scope,
      preset.scopeIds,
      request.characterId,
      request.moduleId,
    )
  );
}

function worldbookMatches(
  book: WorldbookEntry,
  character: CharacterCard,
  request: ContextRequest,
) {
  if (!book.enabled) return false;
  const boundToCharacter = character.worldbookIds.includes(book.id);
  if (
    !boundToCharacter &&
    !scopeMatches(
      book.scope,
      book.scopeIds,
      request.characterId,
      request.moduleId,
    )
  ) {
    return false;
  }
  if (book.triggerMode === "always") return true;
  if (book.triggerMode === "manual") {
    return request.manualWorldbookIds.includes(book.id);
  }
  const message = book.caseSensitive
    ? request.message
    : request.message.toLocaleLowerCase();
  const checks = book.keywords.map((keyword) =>
    message.includes(
      book.caseSensitive ? keyword : keyword.toLocaleLowerCase(),
    ),
  );
  const keywordMatched =
    book.keywordLogic === "all"
      ? checks.length > 0 && checks.every(Boolean)
      : checks.some(Boolean);
  if (!keywordMatched) return false;
  if (book.probability >= 100) return true;
  const seed = `${book.id}:${request.message}`
    .split("")
    .reduce((total, value) => (total * 31 + value.charCodeAt(0)) >>> 0, 7);
  return seed % 100 < book.probability;
}

function section(
  position: ContextSection["position"],
  title: string,
  content: string,
  sourceId: string,
  sourceType: ContextSection["sourceType"],
): ContextSection {
  return { position, title, content, sourceId, sourceType };
}

export function buildContext(
  snapshot: {
    characters: CharacterCard[];
    worldbooks: WorldbookEntry[];
    presets: PromptPreset[];
    memories?: CharacterMemory[];
  },
  request: ContextRequest,
  options: ContextBuildOptions = {},
): ContextBundle {
  const character =
    snapshot.characters.find(
      (item) => item.id === request.characterId && item.enabled,
    ) ?? null;

  if (!character) {
    return {
      character: null,
      preset: null,
      worldbooks: [],
      memories: [],
      sections: [],
      promptPreview: "",
      characterCount: 0,
    };
  }

  const presetCandidate = snapshot.presets.find(
    (item) => item.id === request.presetId,
  );
  const preset =
    presetCandidate && presetMatches(presetCandidate, request)
      ? presetCandidate
      : null;
  const userPersona =
    snapshot.characters.find(
      (item) =>
        item.id === character.userPersonaId &&
        item.kind === "user" &&
        item.enabled,
    ) ?? null;
  const worldbooks = snapshot.worldbooks
    .filter((book) => worldbookMatches(book, character, request))
    .sort((left, right) => left.priority - right.priority);
  const memories =
    options.selectedMemories ??
    memoryEngine.retrieve(
      (snapshot.memories ?? []).filter(
        (memory) => memory.characterId === character.id,
      ),
      request.message,
      options.memoryLimit ?? 6,
    );

  const sections: ContextSection[] = [];
  if (preset) {
    sections.push(
      section("preset", preset.title, preset.content, preset.id, "preset"),
    );
  }
  if (userPersona) {
    sections.push(
      section(
        "before-character",
        `用户人设 · ${userPersona.name}`,
        userPersona.prompt || userPersona.summary,
        userPersona.id,
        "character",
      ),
    );
  }
  for (const book of worldbooks.filter(
    (item) => item.injectionPosition === "before-character",
  )) {
    sections.push(
      section(
        book.injectionPosition,
        book.title,
        book.content,
        book.id,
        "worldbook",
      ),
    );
  }
  for (const memory of memories) {
    sections.push(
      section(
        "memory",
        `记忆 · ${memory.title}`,
        memory.content,
        memory.id,
        "memory",
      ),
    );
  }
  sections.push(
    section(
      "character",
      character.name,
      [
        character.prompt || character.summary,
        character.scenario ? `当前情景：${character.scenario}` : "",
        character.exampleDialogue
          ? `对话示例：\n${character.exampleDialogue}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      character.id,
      "character",
    ),
  );
  for (const book of worldbooks.filter(
    (item) => item.injectionPosition !== "before-character",
  )) {
    sections.push(
      section(
        book.injectionPosition,
        book.title,
        book.content,
        book.id,
        "worldbook",
      ),
    );
  }

  const promptPreview = sections
    .filter((item) => item.content.trim())
    .map((item) => `【${item.title}】\n${item.content.trim()}`)
    .join("\n\n");

  return {
    character,
    preset,
    worldbooks,
    memories,
    sections,
    promptPreview,
    characterCount: promptPreview.length,
  };
}
