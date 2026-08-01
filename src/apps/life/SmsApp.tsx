import { useEffect, useMemo, useRef, useState } from "react";
import { ContextReceiptDrawer } from "../connection/ContextReceiptDrawer";
import type { ContextReceipt } from "../../features/context/contextReceipt";
import { lifeInteractionEngine } from "../../features/life/lifeInteractionEngine";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import {
  CharacterSelect,
  LifeAppHeading,
  TimelinePreview,
  useLifeTimeline,
} from "./lifeShared";

interface SmsAppProps {
  onOpenSettings: () => void;
}

interface ReplySeed {
  content: string;
  eventId: string;
}

export function SmsApp({ onOpenSettings }: SmsAppProps) {
  const { events, characters, characterMap } = useLifeTimeline();
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [pendingReply, setPendingReply] = useState("");
  const [replySeed, setReplySeed] = useState<ReplySeed | null>(null);
  const [receipt, setReceipt] = useState<ContextReceipt | null>(null);
  const [memoryStatus, setMemoryStatus] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!characters.some((character) => character.id === characterId)) {
      setCharacterId(characters[0]?.id ?? "");
    }
  }, [characters, characterId]);

  useEffect(() => {
    abortRef.current?.abort();
    setPendingReply("");
    setReplySeed(null);
    setReceipt(null);
    setMemoryStatus("");
    setError("");
  }, [characterId]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const messages = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.kind === "sms" && event.participantIds.includes(characterId),
        )
        .reverse(),
    [events, characterId],
  );
  const activeCharacter = characterMap.get(characterId);
  const settings = aiSettingsRepository.read();
  const aiReady = Boolean(settings.baseUrl && settings.model);

  async function generateReply(seed: ReplySeed) {
    if (!characterId || generating) return;
    setGenerating(true);
    setPendingReply("");
    setReceipt(null);
    setMemoryStatus("正在检索相关记忆与共同生活…");
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await lifeInteractionEngine.generateSmsReply({
        characterId,
        message: seed.content,
        sourceEventId: seed.eventId,
        signal: controller.signal,
        onToken: setPendingReply,
      });
      setPendingReply(result.text);
      setReceipt(result.receipt);
      setMemoryStatus(result.memoryStatus);
    } catch (caught) {
      setError(
        controller.signal.aborted
          ? "已停止生成，可以重新生成或放弃这次回复"
          : caught instanceof Error
            ? caught.message
            : "角色回复失败",
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setGenerating(false);
    }
  }

  async function send() {
    const message = content.trim();
    if (!characterId || !message || generating || replySeed) return;
    if (!aiReady) {
      setError("请先完成 AI 设置，角色才能真正回复短信");
      return;
    }
    const outgoing = lifeTimelineRepository.save(
      lifeTimelineRepository.create("sms", {
        participantIds: [characterId],
        actor: "user",
        title: `给${activeCharacter?.remark || activeCharacter?.name || "角色"}的短信`,
        content: message,
      }),
    );
    const seed = { content: message, eventId: outgoing.id };
    setContent("");
    setReplySeed(seed);
    await generateReply(seed);
  }

  function acceptReply() {
    const reply = pendingReply.trim();
    if (!reply || !activeCharacter) return;
    lifeTimelineRepository.save(
      lifeTimelineRepository.create("sms", {
        participantIds: [characterId],
        actor: "character",
        title: `${activeCharacter.remark || activeCharacter.name}发来短信`,
        content: reply,
      }),
    );
    setPendingReply("");
    setReplySeed(null);
    setError("");
  }

  function discardReply() {
    abortRef.current?.abort();
    setPendingReply("");
    setReplySeed(null);
    setReceipt(null);
    setMemoryStatus("");
    setError("");
  }

  function remove(eventId: string) {
    if (!window.confirm("删除这条短信吗？")) return;
    lifeTimelineRepository.remove(eventId);
  }

  return (
    <section className="life-app sms-app">
      <LifeAppHeading
        eyebrow="LIFE · SHORT MESSAGES · v0.18"
        title="短信"
        description="发送后由角色真正回复；确认的回复与其他生活应用共用兔兔时间线。"
      />

      <section className="sms-contact-card">
        <div className="life-large-avatar">
          {activeCharacter?.avatar ? (
            <img src={activeCharacter.avatar} alt="" />
          ) : (
            activeCharacter?.name.slice(0, 1) || "?"
          )}
        </div>
        <div className="sms-contact-main">
          <CharacterSelect
            characters={characters}
            value={characterId}
            onChange={setCharacterId}
            allowNone={false}
            label="当前联系人"
          />
          <span className={aiReady ? "sms-ai-ready" : "sms-ai-missing"}>
            {aiReady ? `模型已连接 · ${settings.model}` : "尚未完成 AI 设置"}
          </span>
        </div>
      </section>

      {!aiReady && (
        <button className="sms-settings-callout" type="button" onClick={onOpenSettings}>
          去完成 AI 设置
        </button>
      )}

      <div className="sms-thread">
        {characters.length === 0 && (
          <p className="life-empty">请先在角色档案创建一位联系人。</p>
        )}
        {characters.length > 0 && messages.length === 0 && (
          <p className="life-empty">还没有短信，写下第一句吧。</p>
        )}
        {messages.map((message) => (
          <article className={`sms-bubble ${message.actor}`} key={message.id}>
            <p>{message.content}</p>
            <footer>
              <time>
                {new Date(message.eventAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <button
                type="button"
                aria-label="删除短信"
                onClick={() => remove(message.id)}
              >
                ×
              </button>
            </footer>
          </article>
        ))}
      </div>

      {replySeed && (
        <section className="sms-reply-preview" aria-live="polite">
          <header>
            <span>角色回复预览</span>
            <em>{generating ? "正在输入…" : "尚未写入时间线"}</em>
          </header>
          <p className={pendingReply ? "" : "placeholder"}>
            {pendingReply || (generating ? "正在连接角色…" : "这次没有生成出回复")}
          </p>
          {memoryStatus && <small>{memoryStatus}</small>}
          <div className="sms-preview-actions">
            {generating ? (
              <button type="button" onClick={() => abortRef.current?.abort()}>
                停止生成
              </button>
            ) : (
              <>
                <button
                  className="primary"
                  type="button"
                  disabled={!pendingReply.trim()}
                  onClick={acceptReply}
                >
                  收下回复
                </button>
                <button type="button" onClick={() => void generateReply(replySeed)}>
                  重新生成
                </button>
                <button type="button" onClick={discardReply}>
                  放弃
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {error && <p className="sms-error" role="alert">{error}</p>}
      {receipt && <ContextReceiptDrawer receipt={receipt} mode="sent" />}

      <section className="sms-composer">
        <small>兔兔发出 · 角色会读取相关资料后回应</small>
        <div>
          <input
            value={content}
            placeholder={replySeed ? "请先处理上一次回复…" : "写一条短信…"}
            disabled={generating || Boolean(replySeed)}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void send();
            }}
          />
          <button
            type="button"
            disabled={
              !characterId ||
              !content.trim() ||
              generating ||
              Boolean(replySeed)
            }
            onClick={() => void send()}
          >
            ↑
          </button>
        </div>
      </section>

      <TimelinePreview
        events={events.filter((event) =>
          event.participantIds.includes(characterId),
        )}
        characterMap={characterMap}
        limit={4}
      />
    </section>
  );
}
