import { useEffect, useMemo, useRef, useState } from "react";
import { openAICompatibleAdapter } from "../../ai/openAICompatibleAdapter";
import { buildContext } from "../../context/contextBuilder";
import { memoryEngine } from "../../memory/memoryEngine";
import { vectorMemoryEngine } from "../../memory/vectorMemoryEngine";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import { chatRepository } from "../../storage/chatRepository";
import { contextSessionRepository } from "../../storage/contextSessionRepository";
import { libraryRepository } from "../../storage/libraryRepository";
import { memoryExtractionRepository } from "../../storage/memoryExtractionRepository";
import { memoryRepository } from "../../storage/memoryRepository";
import type { ChatMessage } from "../../types/ai";
import type { ContextRequest } from "../../types/context";

interface ConnectionCenterAppProps {
  onOpenSettings: () => void;
  onOpenWorkbench: () => void;
}

function messageId(role: ChatMessage["role"]) {
  return `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function initialSession(): ContextRequest {
  const saved = contextSessionRepository.read();
  const snapshot = libraryRepository.exportSnapshot();
  const character =
    snapshot.characters.find(
      (item) =>
        item.id === saved.characterId &&
        item.enabled &&
        item.kind !== "user",
    ) ??
    snapshot.characters.find(
      (item) => item.enabled && item.kind !== "user",
    );
  const preferredPresetId =
    character?.defaultPresetId || saved.presetId;
  return {
    ...saved,
    message: "",
    characterId: character?.id ?? "",
    presetId:
      snapshot.presets.some(
        (item) => item.id === preferredPresetId && item.enabled,
      )
        ? preferredPresetId
        : snapshot.presets.find((item) => item.enabled)?.id ?? "",
  };
}

function messagesForCharacter(characterId: string): ChatMessage[] {
  const existing = chatRepository.messages(characterId);
  if (existing.length > 0 || !characterId) return existing;
  const character = libraryRepository
    .characters()
    .find((item) => item.id === characterId);
  if (!character?.greeting.trim()) return [];
  const greeting: ChatMessage = {
    id: messageId("assistant"),
    role: "assistant",
    content: character.greeting.trim(),
    createdAt: Date.now(),
  };
  chatRepository.save(characterId, [greeting]);
  return [greeting];
}

export function ConnectionCenterApp({
  onOpenSettings,
  onOpenWorkbench,
}: ConnectionCenterAppProps) {
  const [snapshot, setSnapshot] = useState(() =>
    libraryRepository.exportSnapshot(),
  );
  const [session, setSession] = useState(initialSession);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    messagesForCharacter(session.characterId),
  );
  const [characterMemories, setCharacterMemories] = useState(() =>
    memoryRepository.forCharacter(session.characterId),
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reload = () => setSnapshot(libraryRepository.exportSnapshot());
    window.addEventListener(libraryRepository.changeEvent, reload);
    return () =>
      window.removeEventListener(libraryRepository.changeEvent, reload);
  }, []);

  useEffect(() => {
    contextSessionRepository.save({ ...session, message: "" });
  }, [session]);

  useEffect(() => {
    setMessages(messagesForCharacter(session.characterId));
    setCharacterMemories(
      memoryRepository.forCharacter(session.characterId),
    );
    setMemoryStatus("");
  }, [session.characterId]);

  useEffect(() => {
    const reload = () =>
      setCharacterMemories(
        memoryRepository.forCharacter(session.characterId),
      );
    window.addEventListener(memoryRepository.changeEvent, reload);
    return () =>
      window.removeEventListener(memoryRepository.changeEvent, reload);
  }, [session.characterId]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const characters = snapshot.characters.filter(
    (item) => item.enabled && item.kind !== "user",
  );
  const presets = snapshot.presets.filter((item) => item.enabled);
  const selectedPreset = presets.find(
    (item) => item.id === session.presetId,
  );
  const manualBooks = snapshot.worldbooks.filter(
    (item) => item.enabled && item.triggerMode === "manual",
  );
  const settings = aiSettingsRepository.read();
  const effectiveMemoryLimit =
    selectedPreset?.memoryLimit || settings.memoryLimit;
  const previewBundle = useMemo(
    () =>
      buildContext(
        { ...snapshot, memories: characterMemories },
        { ...session, message: draft },
        { memoryLimit: effectiveMemoryLimit },
      ),
    [snapshot, characterMemories, session, draft, effectiveMemoryLimit],
  );
  const activeCharacter = previewBundle.character;
  const aiReady = Boolean(settings.baseUrl && settings.model);

  function saveMessages(next: ChatMessage[]) {
    setMessages(next);
    chatRepository.save(session.characterId, next);
  }

  function toggleManualBook(bookId: string) {
    setSession((current) => ({
      ...current,
      manualWorldbookIds: current.manualWorldbookIds.includes(bookId)
        ? current.manualWorldbookIds.filter((id) => id !== bookId)
        : [...current.manualWorldbookIds, bookId],
    }));
  }

  async function organizeMemories(
    sourceMessages: ChatMessage[],
    force: boolean,
  ) {
    if (!activeCharacter || extracting || sourceMessages.length === 0) return;
    const currentSettings = aiSettingsRepository.read();
    if (!currentSettings.baseUrl || !currentSettings.model) return;
    const processedCount =
      memoryExtractionRepository.processedCount(session.characterId);
    let pending = sourceMessages.slice(processedCount);
    const pendingRounds = pending.filter(
      (message) => message.role === "user",
    ).length;
    if (
      !force &&
      (!currentSettings.autoMemory ||
        pendingRounds < currentSettings.memoryInterval)
    ) {
      return;
    }
    if (force && pending.length === 0) {
      pending = sourceMessages.slice(-16);
    }
    if (pending.length === 0) {
      setMemoryStatus("没有新的聊天需要整理");
      return;
    }

    setExtracting(true);
    setMemoryStatus("图书管理员正在整理记忆…");
    try {
      const candidates = await memoryEngine.extract(
        currentSettings,
        activeCharacter.name,
        pending,
      );
      const result = memoryRepository.mergeExtracted(
        session.characterId,
        candidates,
        pending.at(-1)?.id ?? "",
      );
      memoryExtractionRepository.markProcessed(
        session.characterId,
        sourceMessages.length,
      );
      let vectorNote = "";
      if (currentSettings.vectorMemoryEnabled && candidates.length > 0) {
        try {
          const indexed = await vectorMemoryEngine.ensureIndexed(
            currentSettings,
            memoryRepository.forCharacter(session.characterId),
          );
          vectorNote = indexed ? `，建立 ${indexed} 条向量` : "";
        } catch {
          vectorNote = "，向量索引稍后重试";
        }
      }
      setMemoryStatus(
        candidates.length === 0
          ? "这段聊天没有需要长期保存的内容"
          : `记忆整理完成：新增 ${result.created} 条，更新 ${result.updated} 条${vectorNote}`,
      );
    } catch (caught) {
      setMemoryStatus(
        caught instanceof Error ? `记忆整理失败：${caught.message}` : "记忆整理失败",
      );
    } finally {
      setExtracting(false);
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content || sending || !activeCharacter) return;
    const settings = aiSettingsRepository.read();
    if (!settings.baseUrl || !settings.model) {
      setError("请先在 AI 设置中填写接口地址和模型");
      return;
    }

    const userMessage: ChatMessage = {
      id: messageId("user"),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    const assistantMessage: ChatMessage = {
      id: messageId("assistant"),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };
    const requestMessages = [...messages, userMessage];
    const visibleMessages = [...requestMessages, assistantMessage];
    saveMessages(visibleMessages);
    setDraft("");
    setError("");
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const retrieval = await vectorMemoryEngine.retrieve(
        settings,
        characterMemories,
        content,
        controller.signal,
      );
      if (retrieval.fallbackReason) {
        setMemoryStatus(`向量检索已回退：${retrieval.fallbackReason}`);
      } else if (retrieval.mode === "hybrid") {
        setMemoryStatus(
          `混合检索命中 ${retrieval.memories.length} 条记忆${
            retrieval.indexedCount
              ? `，新建 ${retrieval.indexedCount} 条向量`
              : ""
          }`,
        );
      }
      const context = buildContext(
        { ...snapshot, memories: characterMemories },
        { ...session, message: content },
        {
          memoryLimit: effectiveMemoryLimit,
          selectedMemories: retrieval.memories,
        },
      );
      const historyLimit =
        activeCharacter.contextLimit ||
        selectedPreset?.historyLimit ||
        0;
      const modelMessages =
        historyLimit > 0
          ? requestMessages.slice(-historyLimit)
          : requestMessages;
      const response = await openAICompatibleAdapter.chat({
        settings,
        systemPrompt: context.promptPreview,
        messages: modelMessages,
        generation: selectedPreset
          ? {
              temperature: selectedPreset.temperature ?? undefined,
              topP: selectedPreset.topP ?? undefined,
              maxTokens: selectedPreset.maxTokens ?? undefined,
            }
          : undefined,
        signal: controller.signal,
        onToken: (fullText) => {
          const next = visibleMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: fullText }
              : message,
          );
          saveMessages(next);
        },
      });
      const next = visibleMessages.map((message) =>
        message.id === assistantMessage.id
          ? { ...message, content: response }
          : message,
      );
      saveMessages(next);
      void organizeMemories(next, false);
    } catch (caught) {
      if (controller.signal.aborted) {
        setError("已停止生成");
      } else {
        setError(caught instanceof Error ? caught.message : "发送失败");
      }
      const current = chatRepository.messages(session.characterId);
      saveMessages(
        current.filter(
          (message) =>
            message.id !== assistantMessage.id || message.content.trim(),
        ),
      );
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clearChat() {
    if (!window.confirm("清空与当前角色的聊天记录吗？")) return;
    chatRepository.clear(session.characterId);
    memoryExtractionRepository.reset(session.characterId);
    setMessages([]);
  }

  if (characters.length === 0) {
    return (
      <section className="chat-app">
        <div className="connection-empty">
          <strong>还没有可聊天的角色</strong>
          <p>请先回到“角色档案”创建一位 AI 角色。</p>
          <button type="button" onClick={onOpenWorkbench}>
            打开角色连接工作台
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="chat-app">
      <header className="chat-heading">
        <div className="chat-avatar">
          {activeCharacter?.avatar ? (
            <img src={activeCharacter.avatar} alt="" />
          ) : (
            activeCharacter?.name.slice(0, 1)
          )}
        </div>
        <div>
          <h1>{activeCharacter?.remark || activeCharacter?.name || "手机通讯"}</h1>
          <span>{sending ? "正在回应…" : aiReady ? "连接就绪" : "尚未设置模型"}</span>
        </div>
        <button type="button" onClick={onOpenSettings} aria-label="打开 AI 设置">
          ⚙
        </button>
      </header>

      <details className="chat-context-controls">
        <summary>
          <span>本次连接</span>
          <small>
            {previewBundle.worldbooks.length} 本世界书 ·{" "}
            {previewBundle.memories.length} 条记忆
          </small>
        </summary>
        <div>
          <label>
            角色
            <select
              value={session.characterId}
              onChange={(event) => {
                const character = characters.find(
                  (item) => item.id === event.target.value,
                );
                setSession({
                  ...session,
                  characterId: event.target.value,
                  presetId:
                    character?.defaultPresetId || session.presetId,
                });
              }}
            >
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.remark || character.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            预设
            <select
              value={session.presetId}
              onChange={(event) =>
                setSession({ ...session, presetId: event.target.value })
              }
            >
              <option value="">不使用预设</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.title}
                </option>
              ))}
            </select>
          </label>
          {manualBooks.length > 0 && (
            <div className="connection-chips">
              {manualBooks.map((book) => (
                <button
                  className={
                    session.manualWorldbookIds.includes(book.id)
                      ? "active"
                      : ""
                  }
                  type="button"
                  key={book.id}
                  onClick={() => toggleManualBook(book.id)}
                >
                  {book.title}
                </button>
              ))}
            </div>
          )}
          <div className="chat-context-meta">
            当前消息会读取 {previewBundle.worldbooks.length} 本世界书和{" "}
            {previewBundle.memories.length} 条相关记忆，共约{" "}
            {previewBundle.characterCount} 字。
          </div>
          <button
            className="connection-workbench-button"
            type="button"
            onClick={onOpenWorkbench}
          >
            整理当前角色连接
          </button>
          <button
            className="organize-memory-button"
            type="button"
            disabled={extracting || messages.length === 0}
            onClick={() => void organizeMemories(messages, true)}
          >
            {extracting ? "正在整理…" : "立即整理新记忆"}
          </button>
          <button className="clear-chat-button" type="button" onClick={clearChat}>
            清空当前聊天
          </button>
        </div>
      </details>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-welcome">
            <span>✦</span>
            <strong>连接已经建立</strong>
            <p>第一句话会自动带上当前角色、预设和相关世界书。</p>
          </div>
        )}
        {messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            <p>
              {message.content ||
                (message.role === "assistant" && sending ? "…" : "")}
            </p>
            <time>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </article>
        ))}
      </div>

      {memoryStatus && <p className="chat-memory-status">{memoryStatus}</p>}
      {error && <p className="chat-error">{error}</p>}
      <div className="chat-composer">
        <textarea
          rows={1}
          aria-label="聊天消息"
          placeholder={aiReady ? "发送一条跨世界消息…" : "请先打开右上角 AI 设置"}
          value={draft}
          disabled={sending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        {sending ? (
          <button type="button" onClick={stop} aria-label="停止生成">
            ■
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim()}
            aria-label="发送消息"
          >
            ↑
          </button>
        )}
      </div>
    </section>
  );
}
