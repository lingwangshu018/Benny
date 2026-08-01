import type { PhoneNotification } from "../types/notification";
import type { AppId } from "../types/phone";
import { readJson, writeJson } from "./localStorage";

const KEY = "aether.phoneNotifications";
const CHANGE_EVENT = "aether-notification-change";
const PUSH_EVENT = "aether-notification-push";
const MAX_ITEMS = 120;

function normalize(value: unknown): PhoneNotification | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<PhoneNotification>;
  if (!source.id || !source.appId || !source.title) return null;
  return {
    id: String(source.id),
    schemaVersion: 1,
    kind:
      source.kind === "sms" || source.kind === "call" || source.kind === "system"
        ? source.kind
        : "message",
    appId: source.appId,
    characterId: String(source.characterId || ""),
    title: String(source.title),
    body: String(source.body || ""),
    avatar: String(source.avatar || ""),
    read: source.read === true,
    createdAt: Number(source.createdAt) || Date.now(),
  };
}

function allItems() {
  return readJson<unknown[]>(KEY, [])
    .map(normalize)
    .filter((item): item is PhoneNotification => item !== null)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_ITEMS);
}

function save(items: PhoneNotification[]) {
  writeJson(KEY, items.slice(0, MAX_ITEMS));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const notificationRepository = {
  storageKey: KEY,
  changeEvent: CHANGE_EVENT,
  pushEvent: PUSH_EVENT,

  all: allItems,

  create(seed: Omit<PhoneNotification, "id" | "schemaVersion" | "read" | "createdAt">) {
    const item: PhoneNotification = {
      ...seed,
      id: `notice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      schemaVersion: 1,
      read: false,
      createdAt: Date.now(),
    };
    save([item, ...allItems()]);
    window.dispatchEvent(new CustomEvent(PUSH_EVENT, { detail: item }));
    return item;
  },

  unread(appId?: AppId) {
    return allItems().filter((item) => !item.read && (!appId || item.appId === appId));
  },

  unreadCounts() {
    return allItems().reduce<Partial<Record<AppId, number>>>((counts, item) => {
      if (!item.read) counts[item.appId] = (counts[item.appId] || 0) + 1;
      return counts;
    }, {});
  },

  markRead(id: string) {
    save(allItems().map((item) => (item.id === id ? { ...item, read: true } : item)));
  },

  markAppRead(appId: AppId) {
    save(allItems().map((item) => (item.appId === appId ? { ...item, read: true } : item)));
  },

  clear() {
    save([]);
  },
};
