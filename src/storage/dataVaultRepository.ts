import type { ChatMessage } from "../types/ai";
import type {
  CharacterCard,
  PromptPreset,
  WorldbookEntry,
} from "../types/library";
import type { CharacterMemory } from "../types/memory";
import type { LifeEvent } from "../types/life";
import type { RelationshipProfile } from "../types/relationship";
import type {
  VaultArchive,
  VaultCounts,
  VaultInspection,
  VaultIssue,
  VaultPayload,
  VaultStorageUsage,
} from "../types/vault";
import { memoryVectorRepository } from "./memoryVectorRepository";

const KEYS = {
  characters: "aether.characters",
  worldbooks: "aether.worldbooks",
  presets: "aether.presets",
  chats: "aether.chatSessions.v2",
  memories: "aether.characterMemories",
  memoryExtractionState: "aether.memoryExtractionState",
  timeline: "aether.lifeTimeline",
  relationshipProfiles: "aether.relationshipProfiles",
} as const;

const PREVIOUS_BACKUP_KEY = "aether.dataVault.previousBackup";
const LEGACY_CHAT_KEY = "aether.chatThreads";
const CHANGE_EVENTS = [
  "aether-library-change",
  "aether-memory-change",
  "aether-chat-change",
  "aether-life-change",
  "aether-relationship-change",
];

const EMPTY_COUNTS: VaultCounts = {
  characters: 0,
  worldbooks: 0,
  presets: 0,
  chatCharacters: 0,
  chatSessions: 0,
  chatMessages: 0,
  memories: 0,
  timelineEvents: 0,
  relationshipProfiles: 0,
};

const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "bearer",
  "secretkey",
  "sessionkey",
]);

function bytes(value: string) {
  return new Blob([value]).size;
}

function parseStored<T>(key: string, fallback: T, issues: VaultIssue[]): T {
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    issues.push({
      level: "error",
      code: "invalid-local-json",
      message: `${key} 不是完整的 JSON，暂时不能安全备份。`,
    });
    return fallback;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${stableStringify(item)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digest(value: unknown) {
  const data = new TextEncoder().encode(stableStringify(value));
  const result = await window.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(result)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sensitivePaths(value: unknown, path = "备份"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      sensitivePaths(item, `${path}[${index}]`),
    );
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const normalized = key.toLocaleLowerCase().replace(/[-\s]/g, "");
    const currentPath = `${path}.${key}`;
    return [
      ...(SENSITIVE_KEYS.has(normalized) ? [currentPath] : []),
      ...sensitivePaths(item, currentPath),
    ];
  });
}

function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitive(item)) as T;
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => {
        const normalized = key.toLocaleLowerCase().replace(/[-\s]/g, "");
        return !SENSITIVE_KEYS.has(normalized);
      })
      .map(([key, item]) => [key, stripSensitive(item)]),
  ) as T;
}

function arrayField<T>(
  root: Record<string, unknown>,
  field: string,
  issues: VaultIssue[],
): T[] {
  const value = root[field];
  if (!Array.isArray(value)) {
    issues.push({
      level: "error",
      code: `invalid-${field}`,
      message: `${field} 区域缺失或损坏。`,
    });
    return [];
  }
  return value as T[];
}

function requiredText(
  item: Record<string, unknown>,
  fields: string[],
  label: string,
  index: number,
  issues: VaultIssue[],
) {
  const missing = fields.filter(
    (field) => typeof item[field] !== "string" || !String(item[field]).trim(),
  );
  if (missing.length > 0) {
    issues.push({
      level: "error",
      code: `invalid-${label}-item`,
      message: `${label}第 ${index + 1} 条缺少 ${missing.join("、")}。`,
    });
  }
}

function duplicateWarnings(
  items: unknown[],
  label: string,
  issues: VaultIssue[],
) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== "string") continue;
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  if (duplicates.size > 0) {
    issues.push({
      level: "warning",
      code: `duplicate-${label}`,
      message: `${label}中有 ${duplicates.size} 个重复 ID，恢复时会原样保留。`,
    });
  }
}

function validatePayload(
  value: unknown,
  issues: VaultIssue[],
): VaultPayload | null {
  if (!isRecord(value)) {
    issues.push({
      level: "error",
      code: "invalid-payload",
      message: "备份资料区缺失。",
    });
    return null;
  }
  const characters = arrayField<CharacterCard>(value, "characters", issues);
  const worldbooks = arrayField<WorldbookEntry>(value, "worldbooks", issues);
  const presets = arrayField<PromptPreset>(value, "presets", issues);
  const memories = arrayField<CharacterMemory>(value, "memories", issues);
  let relationshipProfiles: RelationshipProfile[] = [];
  if (value.relationshipProfiles === undefined) {
    issues.push({
      level: "warning",
      code: "legacy-without-relationships",
      message: "这是旧备份，不含关系档案；将为空档案建立初始关系。",
    });
  } else if (!Array.isArray(value.relationshipProfiles)) {
    issues.push({
      level: "error",
      code: "invalid-relationship-profiles",
      message: "关系档案区域已经损坏。",
    });
  } else {
    relationshipProfiles = value.relationshipProfiles as RelationshipProfile[];
  }
  let timeline: LifeEvent[] = [];
  if (value.timeline === undefined) {
    issues.push({
      level: "warning",
      code: "legacy-without-timeline",
      message: "这是 v0.16 旧备份，不含生活时间线；将按空时间线恢复。",
    });
  } else if (!Array.isArray(value.timeline)) {
    issues.push({
      level: "error",
      code: "invalid-timeline",
      message: "生活时间线区域已经损坏。",
    });
  } else {
    timeline = value.timeline as LifeEvent[];
  }
  const chats = value.chats;
  const extraction = value.memoryExtractionState;

  characters.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push({
        level: "error",
        code: "invalid-character-item",
        message: `角色第 ${index + 1} 条不是可识别资料。`,
      });
      return;
    }
    requiredText(item, ["id"], "角色", index, issues);
  });
  worldbooks.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push({
        level: "error",
        code: "invalid-worldbook-item",
        message: `世界书第 ${index + 1} 条不是可识别资料。`,
      });
      return;
    }
    requiredText(item, ["id"], "世界书", index, issues);
  });
  presets.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push({
        level: "error",
        code: "invalid-preset-item",
        message: `预设第 ${index + 1} 条不是可识别资料。`,
      });
      return;
    }
    requiredText(item, ["id"], "预设", index, issues);
  });
  memories.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push({
        level: "error",
        code: "invalid-memory-item",
        message: `记忆第 ${index + 1} 条不是可识别资料。`,
      });
      return;
    }
    requiredText(
      item,
      ["id", "characterId"],
      "记忆",
      index,
      issues,
    );
  });
  timeline.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push({
        level: "error",
        code: "invalid-timeline-item",
        message: `生活事件第 ${index + 1} 条不是可识别资料。`,
      });
      return;
    }
    requiredText(item, ["id", "kind"], "生活事件", index, issues);
    if (
      item.kind !== "moment" &&
      item.kind !== "sms" &&
      item.kind !== "diary" &&
      item.kind !== "photo" &&
      item.kind !== "couple" &&
      item.kind !== "relationship"
    ) {
      issues.push({
        level: "error",
        code: "unknown-timeline-kind",
        message: `生活事件第 ${index + 1} 条类型无法识别。`,
      });
    }
    if (!Array.isArray(item.participantIds)) {
      issues.push({
        level: "error",
        code: "invalid-timeline-participants",
        message: `生活事件第 ${index + 1} 条参与角色损坏。`,
      });
    }
  });
  relationshipProfiles.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push({
        level: "error",
        code: "invalid-relationship-item",
        message: `关系档案第 ${index + 1} 条不是可识别资料。`,
      });
      return;
    }
    requiredText(item, ["characterId", "stage"], "关系档案", index, issues);
    if (!isRecord(item.metrics)) {
      issues.push({
        level: "error",
        code: "invalid-relationship-metrics",
        message: `关系档案第 ${index + 1} 条的成长数值损坏。`,
      });
    }
  });

  if (
    !isRecord(chats) ||
    chats.schemaVersion !== 2 ||
    !isRecord(chats.characters)
  ) {
    issues.push({
      level: "error",
      code: "invalid-chats",
      message: "聊天区域缺失、版本不符或已经损坏。",
    });
  } else {
    for (const [characterId, state] of Object.entries(chats.characters)) {
      if (
        !characterId ||
        !isRecord(state) ||
        !Array.isArray(state.sessions) ||
        typeof state.activeSessionId !== "string"
      ) {
        issues.push({
          level: "error",
          code: "invalid-chat-character",
          message: `角色 ${characterId || "未知"} 的聊天结构损坏。`,
        });
        continue;
      }
      for (const session of state.sessions) {
        if (
          !isRecord(session) ||
          typeof session.id !== "string" ||
          !Array.isArray(session.messages)
        ) {
          issues.push({
            level: "error",
            code: "invalid-chat-session",
            message: `角色 ${characterId} 中有损坏的会话。`,
          });
          continue;
        }
        for (const message of session.messages) {
          if (
            !isRecord(message) ||
            typeof message.id !== "string" ||
            (message.role !== "user" && message.role !== "assistant") ||
            typeof message.content !== "string"
          ) {
            issues.push({
              level: "error",
              code: "invalid-chat-message",
              message: `角色 ${characterId} 的会话中有损坏消息。`,
            });
          }
        }
      }
    }
  }

  if (!isRecord(extraction)) {
    issues.push({
      level: "warning",
      code: "missing-extraction-state",
      message: "记忆整理进度缺失，将按空进度恢复。",
    });
  }

  duplicateWarnings(characters, "角色", issues);
  duplicateWarnings(worldbooks, "世界书", issues);
  duplicateWarnings(presets, "预设", issues);
  duplicateWarnings(memories, "记忆", issues);
  duplicateWarnings(timeline, "生活事件", issues);
  duplicateWarnings(
    relationshipProfiles.map((profile) => ({ ...profile, id: profile.characterId })),
    "关系档案",
    issues,
  );

  const characterIds = new Set(
    characters
      .filter(isRecord)
      .map((item) => String(item.id || ""))
      .filter(Boolean),
  );
  const orphanMemories = memories.filter(
    (memory) =>
      isRecord(memory) &&
      typeof memory.characterId === "string" &&
      !characterIds.has(memory.characterId),
  ).length;
  const chatCharacters =
    isRecord(chats) && isRecord(chats.characters)
      ? Object.keys(chats.characters)
      : [];
  const orphanChats = chatCharacters.filter(
    (characterId) => !characterIds.has(characterId),
  ).length;
  const orphanTimelineLinks = timeline.reduce(
    (total, event) =>
      total +
      (isRecord(event) && Array.isArray(event.participantIds)
        ? event.participantIds.filter(
            (characterId) => !characterIds.has(String(characterId)),
          ).length
        : 0),
    0,
  );
  const orphanRelationships = relationshipProfiles.filter(
    (profile) =>
      isRecord(profile) &&
      typeof profile.characterId === "string" &&
      !characterIds.has(profile.characterId),
  ).length;
  if (orphanMemories > 0) {
    issues.push({
      level: "warning",
      code: "orphan-memories",
      message: `${orphanMemories} 条记忆找不到对应角色，仍会保留。`,
    });
  }
  if (orphanChats > 0) {
    issues.push({
      level: "warning",
      code: "orphan-chats",
      message: `${orphanChats} 个聊天角色找不到角色档案，仍会保留。`,
    });
  }
  if (orphanTimelineLinks > 0) {
    issues.push({
      level: "warning",
      code: "orphan-timeline-participants",
      message: `${orphanTimelineLinks} 个生活事件参与者找不到角色档案，事件仍会保留。`,
    });
  }
  if (orphanRelationships > 0) {
    issues.push({
      level: "warning",
      code: "orphan-relationships",
      message: `${orphanRelationships} 份关系档案找不到对应角色，仍会保留。`,
    });
  }

  return {
    characters,
    worldbooks,
    presets,
    chats:
      isRecord(chats) &&
      chats.schemaVersion === 2 &&
      isRecord(chats.characters)
        ? (chats as unknown as VaultPayload["chats"])
        : { schemaVersion: 2, characters: {} },
    memories,
    memoryExtractionState: isRecord(extraction)
      ? (extraction as Record<string, number>)
      : {},
    timeline,
    relationshipProfiles,
  };
}

function counts(payload: VaultPayload | null): VaultCounts {
  if (!payload) return { ...EMPTY_COUNTS };
  const chatStates = Object.values(payload.chats.characters);
  const sessions = chatStates.flatMap((state) =>
    Array.isArray(state.sessions) ? state.sessions : [],
  );
  return {
    characters: payload.characters.length,
    worldbooks: payload.worldbooks.length,
    presets: payload.presets.length,
    chatCharacters: chatStates.length,
    chatSessions: sessions.length,
    chatMessages: sessions.reduce(
      (total, session) =>
        total + (Array.isArray(session.messages) ? session.messages.length : 0),
      0,
    ),
    memories: payload.memories.length,
    timelineEvents: payload.timeline.length,
    relationshipProfiles: payload.relationshipProfiles.length,
  };
}

function currentPayload(issues: VaultIssue[]): VaultPayload {
  const storedChats = window.localStorage.getItem(KEYS.chats);
  let chats: VaultPayload["chats"];
  if (storedChats !== null) {
    chats = parseStored<VaultPayload["chats"]>(
      KEYS.chats,
      { schemaVersion: 2, characters: {} },
      issues,
    );
  } else {
    const legacy = parseStored<Record<string, ChatMessage[]>>(
      LEGACY_CHAT_KEY,
      {},
      issues,
    );
    chats = {
      schemaVersion: 2,
      characters: Object.fromEntries(
        Object.entries(legacy).map(([characterId, messages], index) => {
          const timestamps = Array.isArray(messages)
            ? messages
                .map((message) => Number(message?.createdAt))
                .filter(Number.isFinite)
            : [];
          const createdAt = timestamps[0] || Date.now();
          const updatedAt = timestamps.at(-1) || createdAt;
          const firstUser = Array.isArray(messages)
            ? messages.find(
                (message) =>
                  message?.role === "user" &&
                  typeof message.content === "string" &&
                  message.content.trim(),
              )
            : undefined;
          const sessionId = `legacy-vault-${index}-${createdAt}`;
          return [
            characterId,
            {
              activeSessionId: sessionId,
              sessions: [
                {
                  id: sessionId,
                  title:
                    firstUser?.content.trim().slice(0, 22) || "旧聊天",
                  createdAt,
                  updatedAt,
                  messages: Array.isArray(messages) ? messages : [],
                },
              ],
            },
          ];
        }),
      ),
    };
  }
  return stripSensitive({
    characters: parseStored<CharacterCard[]>(KEYS.characters, [], issues),
    worldbooks: parseStored<WorldbookEntry[]>(KEYS.worldbooks, [], issues),
    presets: parseStored<PromptPreset[]>(KEYS.presets, [], issues),
    chats,
    memories: parseStored<CharacterMemory[]>(KEYS.memories, [], issues),
    memoryExtractionState: parseStored<Record<string, number>>(
      KEYS.memoryExtractionState,
      {},
      issues,
    ),
    timeline: parseStored<LifeEvent[]>(KEYS.timeline, [], issues),
    relationshipProfiles: parseStored<RelationshipProfile[]>(
      KEYS.relationshipProfiles,
      [],
      issues,
    ),
  });
}

async function createArchiveFromPayload(
  payload: VaultPayload,
): Promise<VaultArchive> {
  return {
    kind: "bunny-data-vault",
    schemaVersion: 1,
    appVersion: "0.19",
    createdAt: Date.now(),
    payload,
    integrity: {
      algorithm: "SHA-256",
      digest: await digest(payload),
    },
  };
}

function writePayload(payload: VaultPayload) {
  const originals = new Map<string, string | null>(
    Object.values(KEYS).map((key) => [key, window.localStorage.getItem(key)]),
  );
  try {
    window.localStorage.setItem(
      KEYS.characters,
      JSON.stringify(payload.characters),
    );
    window.localStorage.setItem(
      KEYS.worldbooks,
      JSON.stringify(payload.worldbooks),
    );
    window.localStorage.setItem(KEYS.presets, JSON.stringify(payload.presets));
    window.localStorage.setItem(KEYS.chats, JSON.stringify(payload.chats));
    window.localStorage.setItem(
      KEYS.memories,
      JSON.stringify(payload.memories),
    );
    window.localStorage.setItem(
      KEYS.memoryExtractionState,
      JSON.stringify(payload.memoryExtractionState),
    );
    window.localStorage.setItem(
      KEYS.timeline,
      JSON.stringify(payload.timeline),
    );
    window.localStorage.setItem(
      KEYS.relationshipProfiles,
      JSON.stringify(payload.relationshipProfiles),
    );
  } catch (error) {
    for (const [key, value] of originals) {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    }
    throw error;
  }
  for (const event of CHANGE_EVENTS) {
    window.dispatchEvent(new Event(event));
  }
}

export const dataVaultRepository = {
  previousBackupKey: PREVIOUS_BACKUP_KEY,

  async createArchive() {
    const issues: VaultIssue[] = [];
    const payload = currentPayload(issues);
    validatePayload(payload, issues);
    const errors = issues.filter((issue) => issue.level === "error");
    if (errors.length > 0) {
      throw new Error(errors[0].message);
    }
    return createArchiveFromPayload(payload);
  },

  async inspectUnknown(input: unknown, sourceBytes = 0): Promise<VaultInspection> {
    const issues: VaultIssue[] = [];
    const sensitive = sensitivePaths(input);
    if (sensitive.length > 0) {
      issues.push({
        level: "warning",
        code: "sensitive-fields",
        message: `发现 ${sensitive.length} 个敏感字段；它们不会被导入。`,
      });
    }
    if (!isRecord(input)) {
      issues.push({
        level: "error",
        code: "invalid-root",
        message: "文件不是可识别的 Bunny 数据保险箱。",
      });
      return {
        valid: false,
        archive: null,
        counts: { ...EMPTY_COUNTS },
        issues,
        containsSensitiveFields: sensitive.length > 0,
        byteSize: sourceBytes,
      };
    }
    if (input.kind !== "bunny-data-vault") {
      issues.push({
        level: "error",
        code: "invalid-kind",
        message: "这不是 Bunny 数据保险箱导出的文件。",
      });
    }
    if (input.schemaVersion !== 1) {
      issues.push({
        level: "error",
        code: "unsupported-version",
        message: `不支持备份版本 ${String(input.schemaVersion ?? "未知")}。`,
      });
    }
    const payload = validatePayload(input.payload, issues);
    const integrity = isRecord(input.integrity) ? input.integrity : null;
    if (
      !integrity ||
      integrity.algorithm !== "SHA-256" ||
      typeof integrity.digest !== "string" ||
      !payload
    ) {
      issues.push({
        level: "error",
        code: "missing-integrity",
        message: "文件缺少完整性校验信息。",
      });
    } else {
      const actualDigest = await digest(input.payload);
      if (actualDigest !== integrity.digest) {
        issues.push({
          level: "error",
          code: "checksum-mismatch",
          message: "校验码不一致：文件可能被截断、修改或已经损坏。",
        });
      } else {
        issues.push({
          level: "info",
          code: "checksum-ok",
          message: "完整性校验通过，文件没有被截断。",
        });
      }
    }
    const valid = !issues.some((issue) => issue.level === "error");
    const sanitizedPayload = payload ? stripSensitive(payload) : null;
    const archive =
      valid && sanitizedPayload
        ? ({
            kind: "bunny-data-vault",
            schemaVersion: 1,
            appVersion:
              input.appVersion === "0.16"
                ? "0.16"
                : input.appVersion === "0.17"
                  ? "0.17"
                  : "0.19",
            createdAt: Number(input.createdAt) || Date.now(),
            payload: sanitizedPayload,
            integrity: {
              algorithm: "SHA-256",
              digest: String(integrity?.digest ?? ""),
            },
          } satisfies VaultArchive)
        : null;
    return {
      valid,
      archive,
      counts: counts(payload),
      issues,
      containsSensitiveFields: sensitive.length > 0,
      byteSize: sourceBytes || bytes(JSON.stringify(input)),
    };
  },

  async inspectCurrent(): Promise<VaultInspection> {
    const issues: VaultIssue[] = [];
    const payload = currentPayload(issues);
    validatePayload(payload, issues);
    if (!issues.some((issue) => issue.level === "error")) {
      issues.push({
        level: "info",
        code: "local-ok",
        message: "当前核心资料结构正常，可以安全备份。",
      });
    }
    const archive = await createArchiveFromPayload(payload);
    return {
      valid: !issues.some((issue) => issue.level === "error"),
      archive,
      counts: counts(payload),
      issues,
      containsSensitiveFields: false,
      byteSize: bytes(JSON.stringify(archive)),
    };
  },

  async importArchive(archive: VaultArchive) {
    const current = await this.createArchive();
    const currentText = JSON.stringify(current);
    window.localStorage.setItem(PREVIOUS_BACKUP_KEY, currentText);
    writePayload(archive.payload);
    await memoryVectorRepository.clear().catch(() => undefined);
  },

  async previousInspection(): Promise<VaultInspection | null> {
    const text = window.localStorage.getItem(PREVIOUS_BACKUP_KEY);
    if (!text) return null;
    try {
      return await this.inspectUnknown(JSON.parse(text), bytes(text));
    } catch {
      return {
        valid: false,
        archive: null,
        counts: { ...EMPTY_COUNTS },
        issues: [
          {
            level: "error",
            code: "invalid-previous-backup",
            message: "上一份本地备份无法解析，可能已经损坏。",
          },
        ],
        containsSensitiveFields: false,
        byteSize: bytes(text),
      };
    }
  },

  async restorePrevious() {
    const previous = await this.previousInspection();
    if (!previous?.valid || !previous.archive) {
      throw new Error("没有可以安全恢复的上一份本地备份。");
    }
    const current = await this.createArchive();
    writePayload(previous.archive.payload);
    window.localStorage.setItem(
      PREVIOUS_BACKUP_KEY,
      JSON.stringify(current),
    );
    await memoryVectorRepository.clear().catch(() => undefined);
  },

  async storageUsage(): Promise<VaultStorageUsage> {
    const categories = [
      ["角色档案", KEYS.characters],
      ["世界书", KEYS.worldbooks],
      ["预设", KEYS.presets],
      ["聊天", KEYS.chats],
      ["兔兔记忆", KEYS.memories],
      ["记忆整理进度", KEYS.memoryExtractionState],
      ["兔兔时间线", KEYS.timeline],
      ["关系档案", KEYS.relationshipProfiles],
    ].map(([label, key]) => ({
      label,
      bytes: bytes(
        `${key}${window.localStorage.getItem(key) ?? ""}`,
      ),
    }));
    const previous = window.localStorage.getItem(PREVIOUS_BACKUP_KEY) ?? "";
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    return {
      bunnyBytes: categories.reduce((total, item) => total + item.bytes, 0),
      previousBackupBytes: bytes(previous),
      originUsageBytes:
        typeof estimate?.usage === "number" ? estimate.usage : null,
      originQuotaBytes:
        typeof estimate?.quota === "number" ? estimate.quota : null,
      categories,
    };
  },
};
