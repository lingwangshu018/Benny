import { useEffect, useMemo, useRef, useState } from "react";
import { openAICompatibleAdapter } from "../../ai/openAICompatibleAdapter";
import { buildContext } from "../../context/contextBuilder";
import {
  contextReceipt,
  type ContextReceipt,
} from "../../features/context/contextReceipt";
import { memoryEngine } from "../../memory/memoryEngine";
import { vectorMemoryEngine } from "../../memory/vectorMemoryEngine";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import { chatRepository } from "../../storage/chatRepository";
import { contextSessionRepository } from "../../storage/contextSessionRepository";
import { libraryRepository } from "../../storage/libraryRepository";
import { memoryExtractionRepository } from "../../storage/memoryExtractionRepository";
import { memoryRepository } from "../../storage/memoryRepository";
import { relationshipRepository } from "../../storage/relationshipRepository";
import type {
  CharacterChatState,
  ChatMessage,
  ChatSearchHit,
} from "../../types/ai";
import type { ContextRequest } from "../../types/context";
import { ChatMessageCard } from "./ChatMessageCard";
import { ChatSessionTools } from "./ChatSessionTools";
import { ContextReceiptDrawer } from "./ContextReceiptDrawer";

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
  const [chatState, setChatState] = useState<CharacterChatState>(() =>
    chatRepository.state(session.characterId),
  );
  const [characterMemories, setCharacterMemories] = useState(() =>
    memoryRepository.forCharacter(session.characterId),
  );
  const [relationshipProfile, setRelationshipProfile] = useState(() =>
    relationshipRepository.forCharacter(session.characterId),
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState("");
  const [lastReceipt, setLastReceipt] = useState<ContextReceipt | null>(null);
  const [sendingMessageId, setSendingMessageId] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<ChatSearchHit[]>([]);
  const [focusedMessageId, setFocusedMessageId] = useState("");
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
    setChatState(chatRepository.state(session.characterId));
    setCharacterMemories(
      memoryRepository.forCharacter(session.characterId),
    );
    setRelationshipProfile(
      relationshipRepository.forCharacter(session.characterId),
    );
    setMemoryStatus("");
    setSearchOpen(false);
    setSearchQuery("");
    setSearchHits([]);
    setFocusedMessageId("");
  }, [session.characterId]);

  useEffect(() => {
    const reload = () =>
      setRelationshipProfile(
        relationshipRepository.forCharacter(session.characterId),
      );
    window.addEventListener(relationshipRepository.changeEvent, reload);
    return () =>
      window.removeEventListener(relationshipRepository.changeEvent, reload);
  }, [session.characterId]);

  useEffect(() => {
    setLastReceipt(null);
  }, [
    session.characterId,
    session.presetId,
    session.manualWorldbookIds.join("|"),
  ]);

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

  useEffect(() => {
    if (!focusedMessageId) return;
    const target = listRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${focusedMessageId}"]`,
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedMessageId, messages]);

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
        { memoryLimit: effectiveMemoryLimit, relationshipProfile },
      ),
    [
      snapshot,
      characterMemories,
      session,
      draft,
      effectiveMemoryLimit,
      relationshipProfile,
    ],
  );
  const activeCharacter = previewBundle.character;
  const aiReady = Boolean(settings.baseUrl && settings.model);
  const previewHistoryLimit =
    activeCharacter?.contextLimit ||
    previewBundle.preset?.historyLimit ||
    0;
  const previewHistoryMessages = useMemo(() => {
    const source = draft.trim()
      ? [...messages, { content: draft.trim() }]
      : messages;
    return previewHistoryLimit > 0
      ? source.slice(-previewHistoryLimit)
      : source;
  }, [draft, messages, previewHistoryLimit]);
  const previewReceipt = useMemo(
    () =>
      contextReceipt.build(previewBundle, {
        historyMessages: previewHistoryMessages,
        historyLimit: previewHistoryLimit,
      }),
    [previewBundle, previewHistoryMessages, previewHistoryLimit],
  );
  const displayedReceipt =
    draft.trim() || !lastReceipt ? previewReceipt : lastReceipt;
  const receiptMode = draft.trim() || !lastReceipt ? "preview" : "sent";
  const latestUserMessageId =
    [...messages].reverse().find((message) => message.role === "user")
      ?.id ?? "";
  const activeSessionId = chatState.activeSessionId;
  const extractionKey = `${session.characterId}:${activeSessionId || "default"}`;

  function saveMessages(next: ChatMessage[]) {
    const saved = chatRepository.save(session.characterId, next);
    setMessages(saved);
    setChatState(chatRepository.state(session.characterId));
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
      memoryExtractionRepository.processedCount(extractionKey);
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
        extractionKey,
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

  async function generateReply(
    requestMessages: ChatMessage[],
    baseMessages: ChatMessage[],
    targetAssistantId: string,
    content: string,
    regeneration: boolean,
  ) {
    if (sending || !activeCharacter) return;
    const settings = aiSettingsRepository.read();
    if (!settings.baseUrl || !settings.model) {
      setError("请先在 AI 设置中填写接口地址和模型");
      return;
    }
    setError("");
    setSending(true);
    setSendingMessageId(targetAssistantId);
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
          relationshipProfile,
        },
      );
      const historyLimit =
        context.character?.contextLimit ||
        context.preset?.historyLimit ||
        0;
      const modelMessages =
        historyLimit > 0
          ? requestMessages.slice(-historyLimit)
          : requestMessages;
      setLastReceipt(
        contextReceipt.build(context, {
          historyMessages: modelMessages,
          historyLimit,
        }),
      );
      const response = await openAICompatibleAdapter.chat({
        settings,
        systemPrompt: context.promptPreview,
        messages: modelMessages,
        generation: context.preset
          ? {
              temperature: context.preset.temperature ?? undefined,
              topP: context.preset.topP ?? undefined,
              maxTokens: context.preset.maxTokens ?? undefined,
            }
          : undefined,
        signal: controller.signal,
        onToken: (fullText) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === targetAssistantId
                ? { ...message, content: fullText }
                : message,
            ),
          );
        },
      });
      const next = regeneration
        ? chatRepository.addReplyVersion(
            session.characterId,
            targetAssistantId,
            response,
          )
        : chatRepository.save(
            session.characterId,
            baseMessages.map((message) =>
              message.id === targetAssistantId
                ? { ...message, content: response }
                : message,
            ),
          );
      setMessages(next);
      setChatState(chatRepository.state(session.characterId));
      if (!regeneration) void organizeMemories(next, false);
    } catch (caught) {
      if (controller.signal.aborted) {
        setError("已停止生成");
      } else {
        setError(caught instanceof Error ? caught.message : "发送失败");
      }
      if (!regeneration) {
        const current = chatRepository.messages(session.characterId);
        const next = current.filter(
          (message) =>
            message.id !== targetAssistantId || message.content.trim(),
        );
        saveMessages(next);
      } else {
        setMessages(chatRepository.messages(session.characterId));
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      setSendingMessageId("");
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
    await generateReply(
      requestMessages,
      visibleMessages,
      assistantMessage.id,
      content,
      false,
    );
  }

  async function regenerateReply(messageId: string) {
    const assistantIndex = messages.findIndex(
      (message) =>
        message.id === messageId && message.role === "assistant",
    );
    if (assistantIndex < 0) return;
    const requestMessages = messages.slice(0, assistantIndex);
    const userMessage = [...requestMessages]
      .reverse()
      .find((message) => message.role === "user");
    if (!userMessage) {
      setError("这条回复前没有可用于重新生成的用户消息");
      return;
    }
    await generateReply(
      requestMessages,
      messages,
      messageId,
      userMessage.content,
      true,
    );
  }

  function stop() {
    abortRef.current?.abort();
  }

  function editLatestMessage(messageId: string, content: string) {
    const next = chatRepository.editLatestUserMessage(
      session.characterId,
      messageId,
      content,
    );
    setMessages(next);
    setChatState(chatRepository.state(session.characterId));
    setMemoryStatus("上一条消息已修改，可重新生成角色回复");
  }

  function deleteMessage(messageId: string) {
    if (!window.confirm("删除这一条消息吗？")) return;
    const next = chatRepository.removeMessage(
      session.characterId,
      messageId,
    );
    setMessages(next);
    setChatState(chatRepository.state(session.characterId));
  }

  function changeReplyVersion(messageId: string, direction: -1 | 1) {
    const next = chatRepository.selectReplyVersion(
      session.characterId,
      messageId,
      direction,
    );
    setMessages(next);
    setChatState(chatRepository.state(session.characterId));
  }

  function newChatSession() {
    const created = chatRepository.newSession(session.characterId);
    if (!created) return;
    const next = messagesForCharacter(session.characterId);
    setMessages(next);
    setChatState(chatRepository.state(session.characterId));
    setLastReceipt(null);
    setError("");
    setMemoryStatus("已新建会话，角色记忆仍会继续使用");
    setSearchOpen(false);
    setSearchQuery("");
    setSearchHits([]);
  }

  function selectChatSession(sessionId: string) {
    const selected = chatRepository.activate(
      session.characterId,
      sessionId,
    );
    if (!selected) return;
    setMessages(messagesForCharacter(session.characterId));
    setChatState(chatRepository.state(session.characterId));
    setLastReceipt(null);
    setError("");
    setMemoryStatus("");
    setFocusedMessageId("");
  }

  function searchChats(query: string) {
    setSearchQuery(query);
    setSearchHits(chatRepository.search(session.characterId, query));
  }

  function selectSearchHit(hit: ChatSearchHit) {
    selectChatSession(hit.sessionId);
    setFocusedMessageId(hit.messageId);
    setSearchOpen(false);
  }

  function exportCharacterChat() {
    if (!activeCharacter) return;
    const name = activeCharacter.remark || activeCharacter.name;
    const payload = chatRepository.exportCharacter(
      activeCharacter.id,
      name,
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name.replace(/[\\/:*?"<>|]/g, "_")}_聊天记录_${
      new Date().toISOString().slice(0, 10)
    }.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMemoryStatus(`已导出 ${name} 的 ${payload.sessions.length} 个会话`);
  }

  function clearChat() {
    if (!window.confirm("清空当前会话吗？角色记忆不会被删除。")) return;
    chatRepository.clear(session.characterId);
    memoryExtractionRepository.reset(extractionKey);
    setMessages([]);
    setChatState(chatRepository.state(session.characterId));
    setLastReceipt(null);
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

      <ChatSessionTools
        state={chatState}
        busy={sending}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        searchHits={searchHits}
        onToggleSearch={() => setSearchOpen((current) => !current)}
        onSearch={searchChats}
        onNewSession={newChatSession}
        onSelectSession={selectChatSession}
        onSelectHit={selectSearchHit}
        onExport={exportCharacterChat}
      />

      <div className="chat-context-stack">
        <ContextReceiptDrawer receipt={displayedReceipt} mode={receiptMode} />
        <details className="chat-context-controls">
          <summary>
            <span>连接设置</span>
            <small>角色、预设与手动世界书</small>
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
            <button
              className="clear-chat-button"
              type="button"
              onClick={clearChat}
            >
              清空当前聊天
            </button>
          </div>
        </details>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-welcome">
            <span>✦</span>
            <strong>连接已经建立</strong>
            <p>第一句话会自动带上当前角色、预设和相关世界书。</p>
          </div>
        )}
        {messages.map((message, index) => (
          <ChatMessageCard
            key={message.id}
            message={message}
            isLatestUser={message.id === latestUserMessageId}
            canRegenerate={messages
              .slice(0, index)
              .some((item) => item.role === "user")}
            busy={sending}
            generating={sending && message.id === sendingMessageId}
            highlighted={message.id === focusedMessageId}
            onEdit={(content) =>
              editLatestMessage(message.id, content)
            }
            onDelete={() => deleteMessage(message.id)}
            onRegenerate={() => void regenerateReply(message.id)}
            onChangeVersion={(direction) =>
              changeReplyVersion(message.id, direction)
            }
          />
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
