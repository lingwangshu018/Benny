import type {
  CharacterLifeProfile,
  OfflineDue,
  OfflineLifePreview,
  RoutineMode,
  RoutineNotes,
} from "../types/characterLife";
import { readJson, writeJson } from "./localStorage";

const KEY = "aether.characterLifeProfiles";
const CHANGE_EVENT = "aether-character-life-change";
const MODES: RoutineMode[] = ["early", "regular", "night-owl"];

const DEFAULT_NOTES: RoutineNotes = {
  morning: "醒来、洗漱，慢慢开始今天",
  daytime: "处理自己的工作、学习与日常事务",
  evening: "吃饭、散步或做喜欢的事",
  night: "整理心情，准备休息",
};

function normalizedNotes(value: unknown): RoutineNotes {
  const source = value && typeof value === "object"
    ? (value as Partial<RoutineNotes>)
    : {};
  return {
    morning: String(source.morning || DEFAULT_NOTES.morning),
    daytime: String(source.daytime || DEFAULT_NOTES.daytime),
    evening: String(source.evening || DEFAULT_NOTES.evening),
    night: String(source.night || DEFAULT_NOTES.night),
  };
}

function normalizedPreview(value: unknown): OfflineLifePreview | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<OfflineLifePreview>;
  if (!source.characterId || !source.activityTitle) return null;
  const createdAt = Number(source.createdAt) || Date.now();
  return {
    id: String(source.id || `offline_${createdAt}`),
    characterId: String(source.characterId),
    offlineFrom: Number(source.offlineFrom) || createdAt,
    offlineTo: Number(source.offlineTo) || createdAt,
    elapsedMinutes: Math.max(1, Number(source.elapsedMinutes) || 1),
    routineLabel: String(source.routineLabel || "自己的日常"),
    activityTitle: String(source.activityTitle),
    activitySummary: String(source.activitySummary || ""),
    proactiveMessage: String(source.proactiveMessage || ""),
    mood: String(source.mood || "平静"),
    createdAt,
  };
}

function normalize(value: unknown): CharacterLifeProfile | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<CharacterLifeProfile>;
  const characterId = String(source.characterId || "").trim();
  if (!characterId) return null;
  const createdAt = Number(source.createdAt) || Date.now();
  return {
    characterId,
    schemaVersion: 1,
    enabled: source.enabled !== false,
    proactiveMessages: source.proactiveMessages === true,
    autoPrepare: source.autoPrepare === true,
    minOfflineMinutes: Math.max(
      15,
      Math.min(1440, Number(source.minOfflineMinutes) || 120),
    ),
    routineMode: MODES.includes(source.routineMode as RoutineMode)
      ? (source.routineMode as RoutineMode)
      : "regular",
    notes: normalizedNotes(source.notes),
    lastSeenAt: Number(source.lastSeenAt) || createdAt,
    lastSettledAt: Number(source.lastSettledAt) || 0,
    pending: normalizedPreview(source.pending),
    createdAt,
    updatedAt: Number(source.updatedAt) || createdAt,
  };
}

function defaults(characterId: string): CharacterLifeProfile {
  return normalize({ characterId, createdAt: Date.now() })!;
}

function allProfiles() {
  return (readJson<unknown[]>(KEY, []) ?? [])
    .map(normalize)
    .filter((profile): profile is CharacterLifeProfile => profile !== null);
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function routineMoment(
  profile: CharacterLifeProfile,
  timestamp = Date.now(),
) {
  const hour = new Date(timestamp).getHours();
  const shifted = profile.routineMode === "early"
    ? (hour + 1) % 24
    : profile.routineMode === "night-owl"
      ? (hour + 21) % 24
      : hour;
  if (shifted >= 6 && shifted < 11) {
    return { key: "morning" as const, label: "清晨", description: profile.notes.morning };
  }
  if (shifted >= 11 && shifted < 18) {
    return { key: "daytime" as const, label: "白天", description: profile.notes.daytime };
  }
  if (shifted >= 18 && shifted < 23) {
    return { key: "evening" as const, label: "夜晚", description: profile.notes.evening };
  }
  return { key: "night" as const, label: "深夜", description: profile.notes.night };
}

export const characterLifeRepository = {
  storageKey: KEY,
  changeEvent: CHANGE_EVENT,

  all(): CharacterLifeProfile[] {
    return allProfiles();
  },

  forCharacter(characterId: string): CharacterLifeProfile | null {
    if (!characterId) return null;
    return allProfiles().find((profile) => profile.characterId === characterId) ?? defaults(characterId);
  },

  save(profile: CharacterLifeProfile): CharacterLifeProfile {
    const normalized = normalize({ ...profile, updatedAt: Date.now() });
    if (!normalized) throw new Error("角色生活档案格式不正确");
    const current = allProfiles();
    const next = current.some((item) => item.characterId === normalized.characterId)
      ? current.map((item) => item.characterId === normalized.characterId ? normalized : item)
      : [...current, normalized];
    writeJson(KEY, next);
    notify();
    return normalized;
  },

  due(characterId: string, now = Date.now()): OfflineDue {
    const profile = this.forCharacter(characterId);
    if (!profile) return { due: false, elapsedMinutes: 0, from: now, to: now };
    const from = Math.max(profile.lastSeenAt, profile.lastSettledAt || 0);
    const elapsedMinutes = Math.max(0, Math.floor((now - from) / 60_000));
    return {
      due: profile.enabled && !profile.pending && elapsedMinutes >= profile.minOfflineMinutes,
      elapsedMinutes,
      from,
      to: now,
    };
  },

  markSeen(characterId: string, now = Date.now()) {
    const profile = this.forCharacter(characterId);
    if (!profile) return null;
    return this.save({ ...profile, lastSeenAt: now });
  },

  setPending(characterId: string, pending: OfflineLifePreview) {
    const profile = this.forCharacter(characterId);
    if (!profile) throw new Error("找不到角色生活档案");
    return this.save({ ...profile, pending });
  },

  settle(characterId: string, now = Date.now()) {
    const profile = this.forCharacter(characterId);
    if (!profile) return null;
    return this.save({
      ...profile,
      pending: null,
      lastSeenAt: now,
      lastSettledAt: now,
    });
  },
};
