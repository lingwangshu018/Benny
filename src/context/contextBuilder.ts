import type {
  ContextBuildOptions,
  ContextBundle,
  ContextRequest,
  ContextSection,
  WorldbookEvaluation,
} from "../types/context";
import type {
  CharacterCard,
  ContextScope,
  PromptPreset,
  WorldbookEntry,
} from "../types/library";
import type { CharacterMemory } from "../types/memory";
import type { LifeEvent } from "../types/life";
import type { RelationshipProfile } from "../types/relationship";
import type { CharacterLifeProfile } from "../types/characterLife";
import { routineMoment } from "../storage/characterLifeRepository";
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

function evaluateWorldbook(
  book: WorldbookEntry,
  character: CharacterCard,
  request: ContextRequest,
): WorldbookEvaluation | null {
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
    return null;
  }
  const base = {
    worldbook: book,
    matchedKeywords: [] as string[],
    missingKeywords: [] as string[],
  };
  if (!book.enabled) {
    return { ...base, included: false, reason: "disabled" };
  }
  if (book.triggerMode === "always") {
    return { ...base, included: true, reason: "always" };
  }
  if (book.triggerMode === "manual") {
    const selected = request.manualWorldbookIds.includes(book.id);
    return {
      ...base,
      included: selected,
      reason: selected ? "manual-selected" : "manual-not-selected",
    };
  }
  const message = book.caseSensitive
    ? request.message
    : request.message.toLocaleLowerCase();
  const checks = book.keywords.map((keyword) => ({
    keyword,
    matched: message.includes(
      book.caseSensitive ? keyword : keyword.toLocaleLowerCase(),
    ),
  }));
  const matchedKeywords = checks
    .filter((check) => check.matched)
    .map((check) => check.keyword);
  const missingKeywords = checks
    .filter((check) => !check.matched)
    .map((check) => check.keyword);
  if (checks.length === 0) {
    return {
      ...base,
      included: false,
      reason: "keywords-empty",
    };
  }
  const keywordMatched =
    book.keywordLogic === "all"
      ? checks.every((check) => check.matched)
      : checks.some((check) => check.matched);
  if (!keywordMatched) {
    return {
      ...base,
      matchedKeywords,
      missingKeywords,
      included: false,
      reason:
        book.keywordLogic === "all" && matchedKeywords.length > 0
          ? "keywords-partial"
          : "keywords-no-match",
    };
  }
  if (book.probability >= 100) {
    return {
      ...base,
      matchedKeywords,
      missingKeywords,
      included: true,
      reason: "keyword-match",
    };
  }
  const seed = `${book.id}:${request.message}`
    .split("")
    .reduce((total, value) => (total * 31 + value.charCodeAt(0)) >>> 0, 7);
  const included = seed % 100 < book.probability;
  return {
    ...base,
    matchedKeywords,
    missingKeywords,
    included,
    reason: included ? "keyword-match" : "probability-miss",
  };
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

function lifeEventText(event: LifeEvent) {
  return [
    event.title,
    event.content,
    event.mood ? `当时的情绪：${event.mood}` : "",
    `发生时间：${new Date(event.eventAt).toLocaleString("zh-CN")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const relationshipStageLabels = {
  stranger: "初识",
  familiar: "熟悉",
  close: "亲近",
  ambiguous: "暧昧",
  committed: "相守",
} as const;

function relationshipText(profile: RelationshipProfile) {
  const { metrics } = profile;
  return [
    `关系阶段：${relationshipStageLabels[profile.stage]}`,
    `亲密 ${metrics.intimacy} / 信任 ${metrics.trust} / 心动 ${metrics.attraction} / 安心 ${metrics.security} / 矛盾 ${metrics.conflict}`,
    `当前关系：${profile.summary}`,
    `彼此印象：${profile.impression}`,
    "关系档案是既有事实与相处基调，不要擅自改写数值或宣布关系升级。",
  ].join("\n");
}

function routineText(profile: CharacterLifeProfile) {
  const moment = routineMoment(profile);
  return [
    `当前时段：${moment.label}`,
    `当前通常会做：${moment.description}`,
    `作息类型：${profile.routineMode}`,
    `主动联系兔兔：${profile.proactiveMessages ? "允许" : "不主动发送"}`,
    "作息是生活节奏参考，不代表角色每次都机械重复同一件事。",
  ].join("\n");
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
      userPersona: null,
      preset: null,
      worldbooks: [],
      worldbookEvaluations: [],
      memories: [],
      lifeEvents: [],
      relationshipProfile: null,
      lifeProfile: null,
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
  const worldbookEvaluations = snapshot.worldbooks
    .map((book) => evaluateWorldbook(book, character, request))
    .filter(
      (evaluation): evaluation is WorldbookEvaluation =>
        evaluation !== null,
    );
  const worldbooks = worldbookEvaluations
    .filter((evaluation) => evaluation.included)
    .map((evaluation) => evaluation.worldbook)
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
  const lifeEvents = options.selectedLifeEvents ?? [];
  const relationshipProfile = options.relationshipProfile ?? null;
  const lifeProfile = options.lifeProfile ?? null;

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
  if (relationshipProfile) {
    sections.push(
      section(
        "relationship",
        "关系档案",
        relationshipText(relationshipProfile),
        relationshipProfile.characterId,
        "relationship",
      ),
    );
  }
  if (lifeProfile?.enabled) {
    sections.push(
      section(
        "routine",
        "角色作息与当前状态",
        routineText(lifeProfile),
        lifeProfile.characterId,
        "routine",
      ),
    );
  }
  for (const event of lifeEvents) {
    sections.push(
      section(
        "timeline",
        `共同生活 · ${event.title || "一段记录"}`,
        lifeEventText(event),
        event.id,
        "life-event",
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
    userPersona,
    preset,
    worldbooks,
    worldbookEvaluations,
    memories,
    lifeEvents,
    relationshipProfile,
    lifeProfile,
    sections,
    promptPreview,
    characterCount: promptPreview.length,
  };
}
