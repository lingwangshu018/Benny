import type {
  CharacterCard,
  CharacterKind,
  InjectionPosition,
  LibrarySnapshot,
  PromptPreset,
  WorldbookEntry,
} from "../types/library";
import { readJson, writeJson } from "./localStorage";

const CHARACTER_KEY = "aether.characters";
const WORLDBOOK_KEY = "aether.worldbooks";
const PRESET_KEY = "aether.presets";
const CHANGE_EVENT = "aether-library-change";

function now() {
  return Date.now();
}

function id(prefix: string) {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringList(value: unknown): string[] {
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

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapCharacter(raw: any): CharacterCard | null {
  if (!raw || typeof raw !== "object") return null;
  const source =
    raw.data && typeof raw.data === "object" && raw.data.name
      ? raw.data
      : raw;
  const name = String(source.name || source.realName || "").trim();
  if (!name) return null;
  const timestamp = Number(source.createdAt) || now();
  const folder = String(source.folder || source.kind || "character");
  const kind: CharacterKind =
    folder === "user" ? "user" : folder === "npc" ? "npc" : "character";
  const promptParts = [
    source.prompt || source.persona || source.systemPrompt,
    source.description && !source.prompt && !source.persona
      ? `角色描述：${source.description}`
      : "",
    source.personality ? `性格：${source.personality}` : "",
  ].filter(Boolean);
  const embeddedBookIds = source.character_book?.entries
    ? Object.values(source.character_book.entries)
        .map((entry: any) => entry?.id ?? entry?.uid)
        .filter((value) => value !== undefined && value !== null)
        .map(String)
    : [];
  return {
    id: String(source.id || id("char")),
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: Number(source.updatedAt) || timestamp,
    name,
    remark: String(source.remark || source.nickname || ""),
    kind,
    summary: String(
      source.summary ||
        source.desc ||
        source.creator_notes ||
        source.description ||
        "",
    ),
    prompt: promptParts.join("\n\n"),
    scenario: String(source.scenario || ""),
    greeting: String(
      source.greeting || source.opening || source.first_mes || "",
    ),
    exampleDialogue: String(source.exampleDialogue || source.mes_example || ""),
    tags: stringList(source.tags),
    avatar: String(source.avatar || ""),
    voice: String(source.voice || source.ttsVoiceId || ""),
    enabled: source.enabled !== false && source.blocked !== true,
    worldbookIds: [
      ...new Set([
        ...stringList(
          source.worldbookIds || source.worldBookIds || source.localWbs,
        ),
        ...embeddedBookIds,
      ]),
    ],
    userPersonaId: String(source.userPersonaId || source.activeMaskId || ""),
    defaultPresetId: String(source.defaultPresetId || source.presetId || ""),
    contextLimit: Math.max(0, Number(source.contextLimit) || 0),
  };
}

function position(value: unknown): InjectionPosition {
  if (
    value === "before-character" ||
    value === "after-character" ||
    value === "author-note" ||
    value === "chat-depth"
  ) {
    return value;
  }
  if (value === "before" || value === 0) return "before-character";
  if (value === "after" || value === 2 || value === 3)
    return "author-note";
  if (value === 4) return "chat-depth";
  return "after-character";
}

function mapWorldbook(raw: any): WorldbookEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || raw.name || raw.comment || "").trim();
  const content = String(raw.content || "").trim();
  if (!title || !content) return null;
  const keywords = stringList(raw.keywords || raw.key);
  const timestamp = Number(raw.createdAt) || now();
  const rawScope = String(raw.scope || (raw.isGlobal ? "global" : "character"));
  return {
    id: String(raw.id ?? raw.uid ?? id("wb")),
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: Number(raw.updatedAt) || timestamp,
    title,
    content,
    category: String(raw.category || raw.group || ""),
    enabled: raw.enabled !== false && raw.disable !== true,
    triggerMode:
      raw.triggerMode === "manual"
          ? "manual"
          : raw.triggerMode === "keyword"
            ? "keyword"
            : raw.constant === true || keywords.length === 0
              ? "always"
              : "keyword",
    keywords,
    keywordLogic: raw.keywordLogic === "all" ? "all" : "any",
    caseSensitive: raw.caseSensitive === true,
    scope:
      rawScope === "module"
        ? "module"
        : rawScope === "global"
          ? "global"
          : "character",
    scopeIds:
      rawScope === "global"
        ? []
        : stringList(raw.scopeIds || (raw.scope ? [raw.scope] : [])),
    injectionPosition: position(raw.injectionPosition ?? raw.position),
    priority: Number(raw.priority ?? raw.order ?? 100),
    probability:
      raw.useProbability === false
        ? 100
        : Math.min(
            100,
            Math.max(0, optionalNumber(raw.probability) ?? 100),
          ),
  };
}

function mapPreset(raw: any): PromptPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || raw.name || "").trim();
  const promptList = Array.isArray(raw.prompts)
    ? raw.prompts
        .filter((item: any) => item?.enabled !== false && item?.content)
        .map((item: any) => String(item.content))
    : [];
  const content = String(
    raw.content ||
      raw.prompt ||
      raw.systemPrompt ||
      raw.main_prompt ||
      promptList.join("\n\n"),
  ).trim();
  if (!title || !content) return null;
  const timestamp = Number(raw.createdAt) || now();
  return {
    id: String(raw.id || id("preset")),
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: Number(raw.updatedAt) || timestamp,
    title,
    description: String(raw.description || raw.desc || ""),
    content,
    category: String(raw.category || ""),
    enabled: raw.enabled !== false,
    scope:
      raw.scope === "character" || raw.scope === "module"
        ? raw.scope
        : "global",
    scopeIds: stringList(raw.scopeIds),
    temperature: optionalNumber(raw.temperature),
    topP: optionalNumber(raw.topP ?? raw.top_p),
    maxTokens: optionalNumber(raw.maxTokens ?? raw.max_tokens),
    historyLimit: Math.max(
      0,
      Number(raw.historyLimit ?? raw.contextLimit) || 0,
    ),
    memoryLimit: Math.max(0, Number(raw.memoryLimit) || 0),
  };
}

function expandWorldbooks(value: unknown): unknown[] {
  const roots = asArray(value);
  return roots.flatMap((item: any) => {
    if (!item || typeof item !== "object" || !item.entries) return [item];
    const entries = Array.isArray(item.entries)
      ? item.entries
      : Object.values(item.entries);
    return entries;
  });
}

function dedupe<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function migrateLegacyIfNeeded() {
  if (window.localStorage.getItem(CHARACTER_KEY) === null) {
    const source = asArray(
      window.localStorage.getItem("charactersData") ??
        window.localStorage.getItem("roles"),
    );
    writeJson(
      CHARACTER_KEY,
      source.map(mapCharacter).filter(Boolean) as CharacterCard[],
    );
  }
  if (window.localStorage.getItem(WORLDBOOK_KEY) === null) {
    const source = asArray(
      window.localStorage.getItem("worldbookData") ??
        window.localStorage.getItem("worldBooks") ??
        window.localStorage.getItem("worldbooks"),
    );
    writeJson(
      WORLDBOOK_KEY,
      source.map(mapWorldbook).filter(Boolean) as WorldbookEntry[],
    );
  }
  if (window.localStorage.getItem(PRESET_KEY) === null) {
    const source = asArray(window.localStorage.getItem("presetsData"));
    writeJson(
      PRESET_KEY,
      source.map(mapPreset).filter(Boolean) as PromptPreset[],
    );
  }
}

export const libraryRepository = {
  changeEvent: CHANGE_EVENT,

  characters(): CharacterCard[] {
    migrateLegacyIfNeeded();
    return (readJson(CHARACTER_KEY, []) as unknown[])
      .map(mapCharacter)
      .filter(Boolean) as CharacterCard[];
  },

  worldbooks(): WorldbookEntry[] {
    migrateLegacyIfNeeded();
    return (readJson(WORLDBOOK_KEY, []) as unknown[])
      .map(mapWorldbook)
      .filter(Boolean) as WorldbookEntry[];
  },

  presets(): PromptPreset[] {
    migrateLegacyIfNeeded();
    return (readJson(PRESET_KEY, []) as unknown[])
      .map(mapPreset)
      .filter(Boolean) as PromptPreset[];
  },

  saveCharacters(items: CharacterCard[]) {
    writeJson(CHARACTER_KEY, items);
    notify();
  },

  saveWorldbooks(items: WorldbookEntry[]) {
    writeJson(WORLDBOOK_KEY, items);
    notify();
  },

  savePresets(items: PromptPreset[]) {
    writeJson(PRESET_KEY, items);
    notify();
  },

  createCharacter(): CharacterCard {
    const timestamp = now();
    return {
      id: id("char"),
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      name: "",
      remark: "",
      kind: "character",
      summary: "",
      prompt: "",
      scenario: "",
      greeting: "",
      exampleDialogue: "",
      tags: [],
      avatar: "",
      voice: "",
      enabled: true,
      worldbookIds: [],
      userPersonaId: "",
      defaultPresetId: "",
      contextLimit: 0,
    };
  },

  createWorldbook(): WorldbookEntry {
    const timestamp = now();
    return {
      id: id("wb"),
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      title: "",
      content: "",
      category: "",
      enabled: true,
      triggerMode: "always",
      keywords: [],
      keywordLogic: "any",
      caseSensitive: false,
      scope: "global",
      scopeIds: [],
      injectionPosition: "after-character",
      priority: 100,
      probability: 100,
    };
  },

  createPreset(): PromptPreset {
    const timestamp = now();
    return {
      id: id("preset"),
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      title: "",
      description: "",
      content: "",
      category: "",
      enabled: true,
      scope: "global",
      scopeIds: [],
      temperature: null,
      topP: null,
      maxTokens: null,
      historyLimit: 0,
      memoryLimit: 0,
    };
  },

  exportSnapshot(): LibrarySnapshot {
    return {
      schemaVersion: 1,
      exportedAt: now(),
      characters: this.characters(),
      worldbooks: this.worldbooks(),
      presets: this.presets(),
    };
  },

  importUnknown(input: unknown) {
    if (!input || typeof input !== "object") {
      throw new Error("文件中没有可识别的数据");
    }
    const root = input as Record<string, unknown>;
    const data =
      root.data &&
      typeof root.data === "object" &&
      !("name" in (root.data as Record<string, unknown>))
        ? (root.data as Record<string, unknown>)
        : root;
    let rawCharacters = asArray(
      data.characters ?? data.charactersData ?? data.roles,
    );
    if (
      rawCharacters.length === 0 &&
      (data.name || data.realName || (root.data as any)?.name)
    ) {
      rawCharacters = [root];
    }
    const characters = rawCharacters
      .map(mapCharacter)
      .filter(Boolean) as CharacterCard[];
    const embeddedBooks = rawCharacters.flatMap((item: any) => {
      const source = item?.data && item.data.name ? item.data : item;
      return source?.character_book ? [source.character_book] : [];
    });
    const worldbooks = expandWorldbooks(
      data.worldbooks ??
        data.worldBooks ??
        data.worldbookData ??
        data.lore ??
        (data.entries ? [data] : []),
    )
      .concat(expandWorldbooks(embeddedBooks))
      .map(mapWorldbook)
      .filter(Boolean) as WorldbookEntry[];
    const presets = asArray(
      data.presets ??
        data.presetsData ??
        data.promptPresets ??
        data.apiPresets,
    )
      .map(mapPreset)
      .filter(Boolean) as PromptPreset[];

    if (!characters.length && !worldbooks.length && !presets.length) {
      throw new Error("没有识别到 Bunny、穗穗机或锁雾机资料");
    }
    this.saveCharacters(dedupe([...this.characters(), ...characters]));
    this.saveWorldbooks(dedupe([...this.worldbooks(), ...worldbooks]));
    this.savePresets(dedupe([...this.presets(), ...presets]));
    return {
      characters: characters.length,
      worldbooks: worldbooks.length,
      presets: presets.length,
    };
  },
};
