import type { ChatMessage } from "../types/ai";
import { readJson, writeJson } from "./localStorage";

const KEY = "aether.chatThreads";

type ChatThreads = Record<string, ChatMessage[]>;

export const chatRepository = {
  messages(characterId: string): ChatMessage[] {
    if (!characterId) return [];
    return readJson<ChatThreads>(KEY, {})[characterId] ?? [];
  },

  save(characterId: string, messages: ChatMessage[]) {
    if (!characterId) return;
    const threads = readJson<ChatThreads>(KEY, {});
    writeJson(KEY, { ...threads, [characterId]: messages });
  },

  clear(characterId: string) {
    if (!characterId) return;
    const threads = readJson<ChatThreads>(KEY, {});
    delete threads[characterId];
    writeJson(KEY, threads);
  },
};
