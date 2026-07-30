import type {
  CharacterChatState,
  ChatMessage,
  ChatMessageVersion,
  ChatSearchHit,
  ChatSession,
} from "../types/ai";
import { readJson, writeJson } from "./localStorage";

const LEGACY_KEY = "aether.chatThreads";
const KEY = "aether.chatSessions.v2";
const CHANGE_EVENT = "aether-chat-change";

interface ChatStore {
  schemaVersion: 2;
  characters: Record<string, CharacterChatState>;
}

type LegacyThreads = Record<string, ChatMessage[]>;

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function versionFor(content: string, createdAt: number): ChatMessageVersion {
  return {
    id: id("reply"),
    content,
    createdAt,
  };
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  if (message.role !== "assistant") {
    return {
      id: String(message.id),
      role: "user",
      content: String(message.content ?? ""),
      createdAt: Number(message.createdAt) || Date.now(),
    };
  }
  const createdAt = Number(message.createdAt) || Date.now();
  const versions = Array.isArray(message.versions)
    ? message.versions
        .map((version) => ({
          id: String(version.id || id("reply")),
          content: String(version.content ?? ""),
          createdAt: Number(version.createdAt) || createdAt,
        }))
        .filter((version) => version.content.trim())
    : [];
  if (versions.length === 0 && String(message.content ?? "").trim()) {
    versions.push(versionFor(String(message.content), createdAt));
  }
  const activeVersion =
    versions.length === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            versions.length - 1,
            Number(message.activeVersion) || 0,
          ),
        );
  return {
    id: String(message.id),
    role: "assistant",
    content:
      versions[activeVersion]?.content ?? String(message.content ?? ""),
    createdAt,
    versions,
    activeVersion,
  };
}

function titleFor(messages: ChatMessage[], fallback: string) {
  const firstUser = messages.find(
    (message) => message.role === "user" && message.content.trim(),
  );
  if (!firstUser) return fallback;
  const title = firstUser.content.replace(/\s+/g, " ").trim();
  return title.length > 22 ? `${title.slice(0, 22)}…` : title;
}

function normalizeSession(session: ChatSession): ChatSession {
  const createdAt = Number(session.createdAt) || Date.now();
  const messages = Array.isArray(session.messages)
    ? session.messages.map(normalizeMessage)
    : [];
  return {
    id: String(session.id || id("session")),
    title: String(session.title || titleFor(messages, "新会话")),
    createdAt,
    updatedAt: Number(session.updatedAt) || createdAt,
    messages,
  };
}

function blankSession(): ChatSession {
  const now = Date.now();
  return {
    id: id("session"),
    title: "新会话",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function normalizeCharacterState(
  state: CharacterChatState | undefined,
): CharacterChatState {
  const sessions = Array.isArray(state?.sessions)
    ? state.sessions.map(normalizeSession)
    : [];
  if (sessions.length === 0) sessions.push(blankSession());
  const activeSessionId = sessions.some(
    (session) => session.id === state?.activeSessionId,
  )
    ? String(state?.activeSessionId)
    : sessions[0].id;
  return { activeSessionId, sessions };
}

function migrateLegacy(): ChatStore {
  const legacy = readJson<LegacyThreads>(LEGACY_KEY, {});
  const characters = Object.fromEntries(
    Object.entries(legacy).map(([characterId, messages]) => {
      const now = Date.now();
      const session = normalizeSession({
        id: id("legacy"),
        title: titleFor(messages, "旧聊天"),
        createdAt: messages[0]?.createdAt || now,
        updatedAt: messages.at(-1)?.createdAt || now,
        messages,
      });
      return [
        characterId,
        { activeSessionId: session.id, sessions: [session] },
      ];
    }),
  );
  const store: ChatStore = { schemaVersion: 2, characters };
  if (Object.keys(characters).length > 0) writeJson(KEY, store);
  return store;
}

function readStore(): ChatStore {
  const stored = readJson<ChatStore | null>(KEY, null);
  if (stored?.schemaVersion === 2 && stored.characters) {
    return {
      schemaVersion: 2,
      characters: Object.fromEntries(
        Object.entries(stored.characters).map(([characterId, state]) => [
          characterId,
          normalizeCharacterState(state),
        ]),
      ),
    };
  }
  return migrateLegacy();
}

function writeStore(store: ChatStore) {
  writeJson(KEY, store);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function withCharacter(
  characterId: string,
  update: (state: CharacterChatState) => CharacterChatState,
) {
  const store = readStore();
  const current = normalizeCharacterState(store.characters[characterId]);
  const next = update(current);
  writeStore({
    ...store,
    characters: {
      ...store.characters,
      [characterId]: next,
    },
  });
  return next;
}

function activeSession(state: CharacterChatState) {
  return (
    state.sessions.find(
      (session) => session.id === state.activeSessionId,
    ) ?? state.sessions[0]
  );
}

function updateActiveSession(
  state: CharacterChatState,
  update: (session: ChatSession) => ChatSession,
) {
  const active = activeSession(state);
  return {
    ...state,
    activeSessionId: active.id,
    sessions: state.sessions.map((session) =>
      session.id === active.id ? update(session) : session,
    ),
  };
}

export const chatRepository = {
  changeEvent: CHANGE_EVENT,

  state(characterId: string): CharacterChatState {
    if (!characterId) {
      return { activeSessionId: "", sessions: [] };
    }
    return normalizeCharacterState(readStore().characters[characterId]);
  },

  messages(characterId: string): ChatMessage[] {
    const state = this.state(characterId);
    return state.sessions.find(
      (session) => session.id === state.activeSessionId,
    )?.messages ?? [];
  },

  save(characterId: string, messages: ChatMessage[]): ChatMessage[] {
    if (!characterId) return [];
    const normalized = messages.map(normalizeMessage);
    withCharacter(characterId, (state) =>
      updateActiveSession(state, (session) => ({
        ...session,
        title: titleFor(normalized, session.title),
        updatedAt: Date.now(),
        messages: normalized,
      })),
    );
    return normalized;
  },

  newSession(characterId: string): ChatSession | null {
    if (!characterId) return null;
    const session = blankSession();
    withCharacter(characterId, (state) => ({
      activeSessionId: session.id,
      sessions: [session, ...state.sessions],
    }));
    return session;
  },

  activate(characterId: string, sessionId: string): ChatSession | null {
    if (!characterId) return null;
    let selected: ChatSession | null = null;
    withCharacter(characterId, (state) => {
      selected =
        state.sessions.find((session) => session.id === sessionId) ??
        null;
      return selected ? { ...state, activeSessionId: sessionId } : state;
    });
    return selected;
  },

  removeMessage(characterId: string, messageId: string): ChatMessage[] {
    let messages: ChatMessage[] = [];
    withCharacter(characterId, (state) =>
      updateActiveSession(state, (session) => {
        messages = session.messages.filter(
          (message) => message.id !== messageId,
        );
        return {
          ...session,
          title: titleFor(messages, "新会话"),
          updatedAt: Date.now(),
          messages,
        };
      }),
    );
    return messages;
  },

  editLatestUserMessage(
    characterId: string,
    messageId: string,
    content: string,
  ): ChatMessage[] {
    let messages: ChatMessage[] = [];
    withCharacter(characterId, (state) =>
      updateActiveSession(state, (session) => {
        const latestUser = [...session.messages]
          .reverse()
          .find((message) => message.role === "user");
        messages = session.messages.map((message) =>
          message.id === messageId &&
          message.id === latestUser?.id &&
          message.role === "user"
            ? { ...message, content: content.trim() }
            : message,
        );
        return {
          ...session,
          title: titleFor(messages, session.title),
          updatedAt: Date.now(),
          messages,
        };
      }),
    );
    return messages;
  },

  addReplyVersion(
    characterId: string,
    messageId: string,
    content: string,
  ): ChatMessage[] {
    let messages: ChatMessage[] = [];
    withCharacter(characterId, (state) =>
      updateActiveSession(state, (session) => {
        messages = session.messages.map((message) => {
          if (message.id !== messageId || message.role !== "assistant") {
            return message;
          }
          const normalized = normalizeMessage(message);
          const versions = [
            ...(normalized.versions ?? []),
            versionFor(content, Date.now()),
          ];
          return {
            ...normalized,
            content,
            versions,
            activeVersion: versions.length - 1,
          };
        });
        return {
          ...session,
          updatedAt: Date.now(),
          messages,
        };
      }),
    );
    return messages;
  },

  selectReplyVersion(
    characterId: string,
    messageId: string,
    direction: -1 | 1,
  ): ChatMessage[] {
    let messages: ChatMessage[] = [];
    withCharacter(characterId, (state) =>
      updateActiveSession(state, (session) => {
        messages = session.messages.map((message) => {
          if (message.id !== messageId || message.role !== "assistant") {
            return message;
          }
          const normalized = normalizeMessage(message);
          const versions = normalized.versions ?? [];
          if (versions.length < 2) return normalized;
          const current = normalized.activeVersion ?? 0;
          const activeVersion =
            (current + direction + versions.length) % versions.length;
          return {
            ...normalized,
            activeVersion,
            content: versions[activeVersion].content,
          };
        });
        return {
          ...session,
          updatedAt: Date.now(),
          messages,
        };
      }),
    );
    return messages;
  },

  clear(characterId: string) {
    if (!characterId) return;
    withCharacter(characterId, (state) =>
      updateActiveSession(state, (session) => ({
        ...session,
        title: "新会话",
        updatedAt: Date.now(),
        messages: [],
      })),
    );
  },

  search(characterId: string, query: string): ChatSearchHit[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!characterId || !normalizedQuery) return [];
    return this.state(characterId).sessions.flatMap((session) =>
      session.messages
        .filter((message) =>
          message.content.toLocaleLowerCase().includes(normalizedQuery),
        )
        .map((message) => ({
          sessionId: session.id,
          sessionTitle: session.title,
          messageId: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
    );
  },

  exportCharacter(characterId: string, characterName: string) {
    const state = this.state(characterId);
    return {
      schemaVersion: 1,
      exportedAt: Date.now(),
      character: {
        id: characterId,
        name: characterName,
      },
      activeSessionId: state.activeSessionId,
      sessions: state.sessions,
    };
  },
};
