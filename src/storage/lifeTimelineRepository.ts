import type {
  LifeEvent,
  LifeEventActor,
  LifeEventKind,
} from "../types/life";
import { readJson, writeJson } from "./localStorage";

const KEY = "aether.lifeTimeline";
const CHANGE_EVENT = "aether-life-change";

function id() {
  return `life_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(raw: unknown): LifeEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<LifeEvent>;
  if (
    source.kind !== "moment" &&
    source.kind !== "sms" &&
    source.kind !== "diary" &&
    source.kind !== "photo" &&
    source.kind !== "couple" &&
    source.kind !== "relationship"
  ) {
    return null;
  }
  const createdAt = Number(source.createdAt) || Date.now();
  const actor: LifeEventActor =
    source.actor === "character" || source.actor === "shared"
      ? source.actor
      : "user";
  return {
    id: String(source.id || id()),
    schemaVersion: 1,
    kind: source.kind,
    participantIds: Array.isArray(source.participantIds)
      ? [...new Set(source.participantIds.map(String).filter(Boolean))]
      : [],
    actor,
    title: String(source.title || ""),
    content: String(source.content || ""),
    media: String(source.media || ""),
    mood: String(source.mood || ""),
    eventAt: Number(source.eventAt) || createdAt,
    createdAt,
    updatedAt: Number(source.updatedAt) || createdAt,
  };
}

function allEvents() {
  return (readJson<unknown[]>(KEY, []) ?? [])
    .map(normalize)
    .filter((event): event is LifeEvent => event !== null)
    .sort((left, right) => right.eventAt - left.eventAt);
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const lifeTimelineRepository = {
  storageKey: KEY,
  changeEvent: CHANGE_EVENT,

  all(): LifeEvent[] {
    return allEvents();
  },

  byKind(kind: LifeEventKind): LifeEvent[] {
    return allEvents().filter((event) => event.kind === kind);
  },

  forCharacter(characterId: string): LifeEvent[] {
    if (!characterId) return [];
    return allEvents().filter((event) =>
      event.participantIds.includes(characterId),
    );
  },

  recent(limit = 6): LifeEvent[] {
    return allEvents().slice(0, Math.max(0, limit));
  },

  create(
    kind: LifeEventKind,
    seed: Partial<Omit<LifeEvent, "id" | "schemaVersion" | "kind">> = {},
  ): LifeEvent {
    const timestamp = Date.now();
    return {
      id: id(),
      schemaVersion: 1,
      kind,
      participantIds: [],
      actor: "user",
      title: "",
      content: "",
      media: "",
      mood: "",
      eventAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...seed,
    };
  },

  save(event: LifeEvent): LifeEvent {
    const normalized = normalize({
      ...event,
      title: event.title.trim(),
      content: event.content.trim(),
      media: event.media.trim(),
      mood: event.mood.trim(),
      updatedAt: Date.now(),
    });
    if (!normalized) throw new Error("生活事件格式不正确");
    const current = allEvents();
    const next = current.some((item) => item.id === normalized.id)
      ? current.map((item) => (item.id === normalized.id ? normalized : item))
      : [normalized, ...current];
    writeJson(KEY, next);
    notify();
    return normalized;
  },

  remove(eventId: string) {
    writeJson(
      KEY,
      allEvents().filter((event) => event.id !== eventId),
    );
    notify();
  },
};
