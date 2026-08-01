import { useEffect, useMemo, useRef, useState } from "react";
import { ContextReceiptDrawer } from "../connection/ContextReceiptDrawer";
import type { ContextReceipt } from "../../features/context/contextReceipt";
import { lifeInteractionEngine } from "../../features/life/lifeInteractionEngine";
import { offlineLifeEngine } from "../../features/life/offlineLifeEngine";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import {
  characterLifeRepository,
  routineMoment,
} from "../../storage/characterLifeRepository";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import type {
  CharacterLifeProfile,
  OfflineLifePreview,
  RoutineNotes,
} from "../../types/characterLife";
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

function elapsedLabel(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时`;
  return `${Math.floor(minutes / 1440)} 天`;
}

const routineFields: Array<{ key: keyof RoutineNotes; label: string }> = [
  { key: "morning", label: "清晨" },
  { key: "daytime", label: "白天" },
  { key: "evening", label: "夜晚" },
  { key: "night", label: "深夜" },
];

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
  const [lifeProfile, setLifeProfile] = useState<CharacterLifeProfile | null>(
    () => characterLifeRepository.forCharacter(characters[0]?.id ?? ""),
  );
  const [offlinePreview, setOfflinePreview] =
    useState<OfflineLifePreview | null>(lifeProfile?.pending ?? null);
  const [offlineReceipt, setOfflineReceipt] = useState<ContextReceipt | null>(null);
  const [lifeStatus, setLifeStatus] = useState("");
  const [lifeGenerating, setLifeGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lifeAbortRef = useRef<AbortController | null>(null);

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
    const profile = characterLifeRepository.forCharacter(characterId);
    setLifeProfile(profile);
    setOfflinePreview(profile?.pending ?? null);
    setOfflineReceipt(null);
    setLifeStatus("");
  }, [characterId]);

  useEffect(() => {
    const reload = () => {
      const profile = characterLifeRepository.forCharacter(characterId);
      setLifeProfile(profile);
      setOfflinePreview(profile?.pending ?? null);
    };
    window.addEventListener(characterLifeRepository.changeEvent, reload);
    return () =>
      window.removeEventListener(characterLifeRepository.changeEvent, reload);
  }, [characterId]);

  useEffect(() => {
    const markAway = () => {
      if (document.visibilityState === "hidden" && characterId) {
        characterLifeRepository.markSeen(characterId);
      }
    };
    document.addEventListener("visibilitychange", markAway);
    return () => {
      document.removeEventListener("visibilitychange", markAway);
      if (characterId) characterLifeRepository.markSeen(characterId);
    };
  }, [characterId]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      lifeAbortRef.current?.abort();
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
  const offlineDue = characterLifeRepository.due(characterId);
  const currentRoutine = lifeProfile ? routineMoment(lifeProfile) : null;

  useEffect(() => {
    if (
      lifeProfile?.characterId === characterId &&
      lifeProfile.enabled &&
      lifeProfile.autoPrepare &&
      offlineDue.due &&
      aiReady &&
      !offlinePreview &&
      !lifeGenerating
    ) {
      void prepareOffline(false);
    }
    // Only attempt once when the selected character is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, lifeProfile?.characterId]);

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
    if (!characterId || !message || generating || lifeGenerating || replySeed) return;
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

  function saveLifeProfile() {
    if (!lifeProfile) return;
    const saved = characterLifeRepository.save({
      ...lifeProfile,
      lastSeenAt: lifeProfile.lastSeenAt || Date.now(),
    });
    setLifeProfile(saved);
    setLifeStatus("作息与主动联系设置已保存");
  }

  async function prepareOffline(force: boolean) {
    if (!characterId || lifeGenerating || generating) return;
    setLifeGenerating(true);
    setLifeStatus("正在根据作息整理角色的离线生活…");
    setOfflineReceipt(null);
    const controller = new AbortController();
    lifeAbortRef.current = controller;
    try {
      const result = await offlineLifeEngine.prepare(characterId, {
        force,
        signal: controller.signal,
      });
      setOfflinePreview(result.preview);
      setOfflineReceipt(result.receipt);
      setLifeStatus("离线生活已准备好，确认前不会写入时间线");
    } catch (caught) {
      setLifeStatus(
        controller.signal.aborted
          ? "已停止整理离线生活"
          : caught instanceof Error
            ? caught.message
            : "离线生活整理失败",
      );
    } finally {
      if (lifeAbortRef.current === controller) lifeAbortRef.current = null;
      setLifeGenerating(false);
    }
  }

  function acceptOffline() {
    if (!offlinePreview) return;
    const result = offlineLifeEngine.commit(offlinePreview);
    setOfflinePreview(null);
    setOfflineReceipt(null);
    setLifeStatus(
      result.message
        ? "已收下这段离线生活和角色的主动短信"
        : "已收下这段离线生活",
    );
  }

  function discardOffline() {
    lifeAbortRef.current?.abort();
    offlineLifeEngine.discard(characterId);
    setOfflinePreview(null);
    setOfflineReceipt(null);
    setLifeStatus("已略过这段离线生活，没有写入任何记录");
  }

  function remove(eventId: string) {
    if (!window.confirm("删除这条短信吗？")) return;
    lifeTimelineRepository.remove(eventId);
  }

  return (
    <section className="life-app sms-app">
      <LifeAppHeading
        eyebrow="LIFE · SHORT MESSAGES · v0.20"
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

      {lifeProfile && (
        <section className="character-life-card">
          <header>
            <div>
              <span>CHARACTER LIFE</span>
              <strong>{currentRoutine?.label || "现在"} · {currentRoutine?.description || "自己的生活"}</strong>
            </div>
            <em>{offlineDue.due ? `离线 ${elapsedLabel(offlineDue.elapsedMinutes)}` : "连接中"}</em>
          </header>
          <div className="character-life-actions">
            <button
              type="button"
              disabled={!aiReady || lifeGenerating || generating || Boolean(offlinePreview)}
              onClick={() => void prepareOffline(offlineDue.due ? false : true)}
            >
              {lifeGenerating
                ? "整理中…"
                : offlineDue.due
                  ? "展开这段离线生活"
                  : "试运行一次"}
            </button>
            <span>{lifeProfile.proactiveMessages ? "允许主动短信" : "只记录离线活动"}</span>
          </div>
          <details className="character-life-settings">
            <summary>作息与主动联系设置</summary>
            <label className="life-toggle">
              <input
                type="checkbox"
                checked={lifeProfile.enabled}
                onChange={(event) => setLifeProfile({ ...lifeProfile, enabled: event.target.checked })}
              />
              开启角色离线生活
            </label>
            <label className="life-toggle">
              <input
                type="checkbox"
                checked={lifeProfile.proactiveMessages}
                onChange={(event) => setLifeProfile({ ...lifeProfile, proactiveMessages: event.target.checked })}
              />
              允许角色主动给兔兔发短信
            </label>
            <label className="life-toggle">
              <input
                type="checkbox"
                checked={lifeProfile.autoPrepare}
                onChange={(event) => setLifeProfile({ ...lifeProfile, autoPrepare: event.target.checked })}
              />
              回到短信时自动准备离线生活
            </label>
            <label className="life-field">
              作息类型
              <select
                value={lifeProfile.routineMode}
                onChange={(event) => setLifeProfile({
                  ...lifeProfile,
                  routineMode: event.target.value as CharacterLifeProfile["routineMode"],
                })}
              >
                <option value="early">早起型</option>
                <option value="regular">规律型</option>
                <option value="night-owl">夜猫型</option>
              </select>
            </label>
            <label className="life-field">
              离开多久后结算
              <select
                value={lifeProfile.minOfflineMinutes}
                onChange={(event) => setLifeProfile({
                  ...lifeProfile,
                  minOfflineMinutes: Number(event.target.value),
                })}
              >
                <option value="30">30 分钟</option>
                <option value="120">2 小时</option>
                <option value="360">6 小时</option>
                <option value="720">12 小时</option>
                <option value="1440">1 天</option>
              </select>
            </label>
            <div className="routine-note-grid">
              {routineFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    value={lifeProfile.notes[field.key]}
                    onChange={(event) => setLifeProfile({
                      ...lifeProfile,
                      notes: { ...lifeProfile.notes, [field.key]: event.target.value },
                    })}
                  />
                </label>
              ))}
            </div>
            <button type="button" onClick={saveLifeProfile}>保存作息设置</button>
          </details>
          {lifeStatus && <p className="character-life-status" role="status">{lifeStatus}</p>}
        </section>
      )}

      {offlinePreview && (
        <section className="offline-life-preview" aria-live="polite">
          <header>
            <span>离线生活回执</span>
            <em>确认前不会写入时间线</em>
          </header>
          <small>{offlinePreview.routineLabel} · 离线 {elapsedLabel(offlinePreview.elapsedMinutes)}</small>
          <strong>{offlinePreview.activityTitle}</strong>
          <p>{offlinePreview.activitySummary}</p>
          {offlinePreview.proactiveMessage && (
            <blockquote>{offlinePreview.proactiveMessage}</blockquote>
          )}
          <div className="sms-preview-actions">
            <button className="primary" type="button" onClick={acceptOffline}>收下这段生活</button>
            <button type="button" onClick={() => void prepareOffline(true)}>重新生成</button>
            <button type="button" onClick={discardOffline}>略过</button>
          </div>
        </section>
      )}

      {offlineReceipt && <ContextReceiptDrawer receipt={offlineReceipt} mode="sent" />}

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
            disabled={generating || lifeGenerating || Boolean(replySeed)}
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
              lifeGenerating ||
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
