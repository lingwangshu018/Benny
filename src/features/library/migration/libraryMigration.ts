import { libraryRepository } from "../../../storage/libraryRepository";
import type {
  CharacterCard,
  LibrarySnapshot,
  PromptPreset,
  WorldbookEntry,
} from "../../../types/library";

export type MigrationSource = "bunny" | "suisui" | "suowu" | "unknown";
export type MigrationStatus = "ready" | "duplicate";

export interface MigrationItem<T> {
  item: T;
  status: MigrationStatus;
  sourceId: string;
}

export interface MigrationPreview {
  source: MigrationSource;
  sourceLabel: string;
  characters: MigrationItem<CharacterCard>[];
  worldbooks: MigrationItem<WorldbookEntry>[];
  presets: MigrationItem<PromptPreset>[];
  warnings: string[];
}

export interface MigrationResult {
  characters: number;
  worldbooks: number;
  presets: number;
  duplicates: number;
}

type UnknownRecord = Record<string, unknown>;

const sourceLabels: Record<MigrationSource, string> = {
  bunny: "兔兔手机资料库",
  suisui: "穗穗机备份",
  suowu: "锁雾机备份",
  unknown: "通用 JSON 资料",
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function text(...values: unknown[]) {
  const value = values.find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  );
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function detectSource(root: UnknownRecord): MigrationSource {
  if (
    root.schemaVersion === 1 &&
    (Array.isArray(root.characters) ||
      Array.isArray(root.worldbooks) ||
      Array.isArray(root.presets))
  ) {
    return "bunny";
  }
  if (
    Array.isArray(root.roles) &&
    ("worldBook" in root ||
      "workData" in root ||
      "altRoles" in root ||
      root.version === "1.0")
  ) {
    return "suisui";
  }
  if (
    Array.isArray(root.roles) &&
    ("worldbooks" in root ||
      "masks" in root ||
      "advancedMemories" in root ||
      "apiPresets" in root)
  ) {
    return "suowu";
  }
  return "unknown";
}

function characterFrom(raw: unknown): CharacterCard | null {
  const outer = record(raw);
  if (!outer) return null;
  const embedded = record(outer.data);
  const source = embedded && text(embedded.name) ? embedded : outer;
  const name = text(source.name, source.realName);
  if (!name) return null;
  const timestamp = numeric(source.createdAt) ?? Date.now();
  const sourceId = text(source.id) || makeId("char");
  const folder = text(source.folder, source.kind);
  return {
    id: sourceId,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: numeric(source.updatedAt) ?? timestamp,
    name,
    remark: text(source.remark, source.nickname),
    kind: folder === "user" ? "user" : folder === "npc" ? "npc" : "character",
    summary: text(
      source.summary,
      source.desc,
      source.creator_notes,
      source.description,
    ),
    prompt: text(
      source.prompt,
      source.persona,
      source.systemPrompt,
      source.personality,
    ),
    scenario: text(source.scenario),
    greeting: text(source.greeting, source.opening, source.first_mes),
    exampleDialogue: text(source.exampleDialogue, source.mes_example),
    tags: list(source.tags),
    avatar: text(source.avatar),
    voice: text(source.voice, source.ttsVoiceId),
    enabled: source.enabled !== false && source.blocked !== true,
    worldbookIds: list(
      source.worldbookIds ?? source.worldBookIds ?? source.localWbs,
    ),
    userPersonaId: text(source.userPersonaId, source.activeMaskId),
    defaultPresetId: text(source.defaultPresetId, source.presetId),
    contextLimit: Math.max(0, numeric(source.contextLimit) ?? 0),
  };
}

function worldbookFrom(raw: unknown, fallbackTitle = ""): WorldbookEntry | null {
  const source = record(raw);
  if (!source) return null;
  const title = text(
    source.title,
    source.name,
    source.comment,
    source.keyword,
    fallbackTitle,
  );
  const content = text(source.content);
  if (!title || !content) return null;
  const timestamp = numeric(source.createdAt) ?? Date.now();
  const keywords = list(source.keywords ?? source.key ?? source.keyword);
  const isGlobal = source.isGlobal === true;
  const scope = text(source.scope);
  const position = source.injectionPosition ?? source.position;
  return {
    id: text(source.id, source.uid) || makeId("wb"),
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: numeric(source.updatedAt) ?? timestamp,
    title,
    content,
    category: text(source.category, source.group),
    enabled: source.enabled !== false && source.disable !== true,
    triggerMode:
      source.triggerMode === "manual"
        ? "manual"
        : source.triggerMode === "keyword" || keywords.length > 0
          ? "keyword"
          : "always",
    keywords,
    keywordLogic: source.keywordLogic === "all" ? "all" : "any",
    caseSensitive: source.caseSensitive === true,
    scope:
      scope === "module"
        ? "module"
        : scope === "character" || (!scope && !isGlobal)
          ? "character"
          : "global",
    scopeIds: scope === "global" || isGlobal ? [] : list(source.scopeIds),
    injectionPosition:
      position === "before" || position === "before-character" || position === 0
        ? "before-character"
        : position === "author-note" || position === 2 || position === 3
          ? "author-note"
          : position === "chat-depth" || position === 4
            ? "chat-depth"
            : "after-character",
    priority: numeric(source.priority ?? source.order) ?? 100,
    probability: Math.min(
      100,
      Math.max(0, numeric(source.probability) ?? 100),
    ),
  };
}

function presetFrom(raw: unknown): PromptPreset | null {
  const source = record(raw);
  if (!source) return null;
  const promptParts = array(source.prompts)
    .map(record)
    .filter((item): item is UnknownRecord => Boolean(item))
    .filter((item) => item.enabled !== false)
    .map((item) => text(item.content))
    .filter(Boolean);
  const title = text(source.title, source.name);
  const content = text(
    source.content,
    source.prompt,
    source.systemPrompt,
    source.main_prompt,
    promptParts.join("\n\n"),
  );
  if (!title || !content) return null;
  const timestamp = numeric(source.createdAt) ?? Date.now();
  const scope = text(source.scope);
  return {
    id: text(source.id) || makeId("preset"),
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: numeric(source.updatedAt) ?? timestamp,
    title,
    description: text(source.description, source.desc),
    content,
    category: text(source.category),
    enabled: source.enabled !== false,
    scope:
      scope === "character" || scope === "module" ? scope : "global",
    scopeIds: list(source.scopeIds),
    temperature: numeric(source.temperature),
    topP: numeric(source.topP ?? source.top_p),
    maxTokens: numeric(source.maxTokens ?? source.max_tokens),
    historyLimit: Math.max(
      0,
      numeric(source.historyLimit ?? source.contextLimit) ?? 0,
    ),
    memoryLimit: Math.max(0, numeric(source.memoryLimit) ?? 0),
  };
}

function expandLegacyWorldBook(value: unknown): unknown[] {
  const source = record(value);
  if (!source) return array(value);
  return Object.entries(source).flatMap(([key, stored]) => {
    if (typeof stored !== "string") {
      const item = record(stored);
      return item ? [{ ...item, title: text(item.title, item.name, key) }] : [];
    }
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
      const item = record(parsed);
      return item ? [{ ...item, title: text(item.title, item.name, key) }] : [];
    } catch {
      return [{ title: key, content: stored }];
    }
  });
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function characterFingerprint(item: CharacterCard) {
  return [item.kind, item.name, item.prompt || item.summary]
    .map(normalize)
    .join("|");
}

function worldbookFingerprint(item: WorldbookEntry) {
  return [item.title, item.content].map(normalize).join("|");
}

function presetFingerprint(item: PromptPreset) {
  return [item.title, item.content].map(normalize).join("|");
}

function mark<T>(
  incoming: T[],
  existing: T[],
  sourceId: (item: T) => string,
  fingerprint: (item: T) => string,
): MigrationItem<T>[] {
  const seen = new Set(existing.map(fingerprint));
  return incoming.map((item) => {
    const key = fingerprint(item);
    const status: MigrationStatus = seen.has(key) ? "duplicate" : "ready";
    seen.add(key);
    return { item, status, sourceId: sourceId(item) };
  });
}

function uniqueId<T extends { id: string }>(
  item: T,
  occupied: Set<string>,
  prefix: string,
) {
  if (!occupied.has(item.id)) {
    occupied.add(item.id);
    return item;
  }
  const replacement = makeId(prefix);
  occupied.add(replacement);
  return { ...item, id: replacement };
}

function additions<T>(items: MigrationItem<T>[]) {
  return items.filter((item) => item.status === "ready").map((item) => item.item);
}

export const libraryMigration = {
  preview(input: unknown, existing: LibrarySnapshot): MigrationPreview {
    const root = record(input);
    if (!root) throw new Error("这个文件不是可以识别的 JSON 资料包");
    const source = detectSource(root);
    const warnings: string[] = [];

    let rawCharacters = array(
      root.characters ?? root.charactersData ?? root.roles,
    );
    if (
      rawCharacters.length === 0 &&
      (root.name || root.realName || record(root.data)?.name)
    ) {
      rawCharacters = [root];
    }

    let rawWorldbooks = array(
      root.worldbooks ?? root.worldBooks ?? root.worldbookData ?? root.lore,
    );
    if (rawWorldbooks.length === 0 && root.worldBook) {
      rawWorldbooks = expandLegacyWorldBook(root.worldBook);
    }
    if (rawWorldbooks.length === 0 && root.entries) {
      const entries = Array.isArray(root.entries)
        ? root.entries
        : Object.values(record(root.entries) ?? {});
      rawWorldbooks = entries;
    }

    const rawPresets = array(
      root.presets ??
        root.presetsData ??
        root.promptPresets ??
        root.masks,
    );

    const characters = rawCharacters
      .map(characterFrom)
      .filter((item): item is CharacterCard => Boolean(item));
    const worldbooks = rawWorldbooks
      .map((item) => worldbookFrom(item))
      .filter((item): item is WorldbookEntry => Boolean(item));
    const presets = rawPresets
      .map(presetFrom)
      .filter((item): item is PromptPreset => Boolean(item));

    if (source === "suisui" && root.worldBooks && root.worldBook) {
      warnings.push("检测到新旧两套穗穗机世界书字段，本次优先读取新版 worldBooks。");
    }
    if (source === "suowu" && Array.isArray(root.apiPresets)) {
      warnings.push("为保护密钥，锁雾机的 API 连接预设不会导入；角色扮演 masks 会作为聊天预设迁移。");
    }
    if (root.chats || root.chatHistory || root.memories || root.advancedMemories) {
      warnings.push("本步骤只搬角色、世界书和预设；聊天与记忆将留给后续专用迁移。");
    }
    if (!characters.length && !worldbooks.length && !presets.length) {
      throw new Error("没有识别到穗穗机、锁雾机或兔兔手机资料");
    }

    return {
      source,
      sourceLabel: sourceLabels[source],
      characters: mark(
        characters,
        existing.characters,
        (item) => item.id,
        characterFingerprint,
      ),
      worldbooks: mark(
        worldbooks,
        existing.worldbooks,
        (item) => item.id,
        worldbookFingerprint,
      ),
      presets: mark(
        presets,
        existing.presets,
        (item) => item.id,
        presetFingerprint,
      ),
      warnings,
    };
  },

  commit(preview: MigrationPreview): MigrationResult {
    const current = libraryRepository.exportSnapshot();
    const occupiedCharacterIds = new Set(
      current.characters.map((item) => item.id),
    );
    const occupiedWorldbookIds = new Set(
      current.worldbooks.map((item) => item.id),
    );
    const occupiedPresetIds = new Set(current.presets.map((item) => item.id));
    const worldbookIdMap = new Map<string, string>();

    const newWorldbooks = additions(preview.worldbooks).map((item) => {
      const migrated = uniqueId(item, occupiedWorldbookIds, "wb");
      worldbookIdMap.set(item.id, migrated.id);
      return migrated;
    });
    const newPresets = additions(preview.presets).map((item) =>
      uniqueId(item, occupiedPresetIds, "preset"),
    );
    const newCharacters = additions(preview.characters).map((item) => {
      const withBindings = {
        ...item,
        worldbookIds: item.worldbookIds.map(
          (worldbookId) => worldbookIdMap.get(worldbookId) ?? worldbookId,
        ),
      };
      return uniqueId(withBindings, occupiedCharacterIds, "char");
    });

    if (newCharacters.length) {
      libraryRepository.saveCharacters([
        ...current.characters,
        ...newCharacters,
      ]);
    }
    if (newWorldbooks.length) {
      libraryRepository.saveWorldbooks([
        ...current.worldbooks,
        ...newWorldbooks,
      ]);
    }
    if (newPresets.length) {
      libraryRepository.savePresets([...current.presets, ...newPresets]);
    }

    return {
      characters: newCharacters.length,
      worldbooks: newWorldbooks.length,
      presets: newPresets.length,
      duplicates:
        preview.characters.filter((item) => item.status === "duplicate").length +
        preview.worldbooks.filter((item) => item.status === "duplicate").length +
        preview.presets.filter((item) => item.status === "duplicate").length,
    };
  },
};
