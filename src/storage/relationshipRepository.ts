import type {
  RelationshipGrowthPreview,
  RelationshipMetrics,
  RelationshipProfile,
  RelationshipStage,
} from "../types/relationship";
import { readJson, writeJson } from "./localStorage";

const KEY = "aether.relationshipProfiles";
const CHANGE_EVENT = "aether-relationship-change";
const STAGES: RelationshipStage[] = [
  "stranger",
  "familiar",
  "close",
  "ambiguous",
  "committed",
];

function clamp(value: unknown, fallback = 0) {
  const number = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(number) ? Math.round(number) : fallback));
}

function metrics(value: unknown): RelationshipMetrics {
  const source = value && typeof value === "object"
    ? (value as Partial<RelationshipMetrics>)
    : {};
  return {
    intimacy: clamp(source.intimacy, 10),
    trust: clamp(source.trust, 10),
    attraction: clamp(source.attraction, 5),
    security: clamp(source.security, 10),
    conflict: clamp(source.conflict, 0),
  };
}

function normalize(raw: unknown): RelationshipProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<RelationshipProfile>;
  if (!String(source.characterId || "").trim()) return null;
  const createdAt = Number(source.createdAt) || Date.now();
  return {
    characterId: String(source.characterId),
    schemaVersion: 1,
    stage: STAGES.includes(source.stage as RelationshipStage)
      ? (source.stage as RelationshipStage)
      : "stranger",
    metrics: metrics(source.metrics),
    summary: String(source.summary || "彼此仍在认识和靠近。"),
    impression: String(source.impression || "关系尚未形成清晰的共同印象。"),
    createdAt,
    updatedAt: Number(source.updatedAt) || createdAt,
    lastReviewedAt: Number(source.lastReviewedAt) || 0,
  };
}

function defaults(characterId: string): RelationshipProfile {
  const now = Date.now();
  return {
    characterId,
    schemaVersion: 1,
    stage: "stranger",
    metrics: metrics(null),
    summary: "彼此仍在认识和靠近。",
    impression: "关系尚未形成清晰的共同印象。",
    createdAt: now,
    updatedAt: now,
    lastReviewedAt: 0,
  };
}

function allProfiles() {
  return (readJson<unknown[]>(KEY, []) ?? [])
    .map(normalize)
    .filter((profile): profile is RelationshipProfile => profile !== null);
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const relationshipRepository = {
  storageKey: KEY,
  changeEvent: CHANGE_EVENT,

  all(): RelationshipProfile[] {
    return allProfiles();
  },

  forCharacter(characterId: string): RelationshipProfile | null {
    if (!characterId) return null;
    return allProfiles().find((profile) => profile.characterId === characterId) ?? defaults(characterId);
  },

  save(profile: RelationshipProfile): RelationshipProfile {
    const normalized = normalize({ ...profile, updatedAt: Date.now() });
    if (!normalized) throw new Error("关系档案格式不正确");
    const current = allProfiles();
    const next = current.some((item) => item.characterId === normalized.characterId)
      ? current.map((item) => item.characterId === normalized.characterId ? normalized : item)
      : [...current, normalized];
    writeJson(KEY, next);
    notify();
    return normalized;
  },

  applyGrowth(preview: RelationshipGrowthPreview): RelationshipProfile {
    const current = this.forCharacter(preview.characterId) ?? defaults(preview.characterId);
    const nextMetrics = Object.fromEntries(
      (Object.keys(current.metrics) as Array<keyof RelationshipMetrics>).map((key) => [
        key,
        clamp(current.metrics[key] + preview.deltas[key]),
      ]),
    ) as unknown as RelationshipMetrics;
    return this.save({
      ...current,
      stage: preview.stage,
      metrics: nextMetrics,
      summary: preview.summary.trim() || current.summary,
      impression: preview.impression.trim() || current.impression,
      lastReviewedAt: Date.now(),
    });
  },
};
