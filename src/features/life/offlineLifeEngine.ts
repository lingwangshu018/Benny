import { openAICompatibleAdapter } from "../../ai/openAICompatibleAdapter";
import { buildContext } from "../../context/contextBuilder";
import {
  contextReceipt,
  type ContextReceipt,
} from "../context/contextReceipt";
import { vectorMemoryEngine } from "../../memory/vectorMemoryEngine";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import {
  characterLifeRepository,
  routineMoment,
} from "../../storage/characterLifeRepository";
import { contextSessionRepository } from "../../storage/contextSessionRepository";
import { libraryRepository } from "../../storage/libraryRepository";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import { memoryRepository } from "../../storage/memoryRepository";
import { relationshipRepository } from "../../storage/relationshipRepository";
import type { ChatMessage } from "../../types/ai";
import type { OfflineLifePreview } from "../../types/characterLife";

export interface OfflineLifeResult {
  preview: OfflineLifePreview;
  receipt: ContextReceipt;
}

function preferredPresetId(characterId: string) {
  const snapshot = libraryRepository.exportSnapshot();
  const character = snapshot.characters.find((item) => item.id === characterId);
  const saved = contextSessionRepository.read();
  return character?.defaultPresetId ||
    (saved.characterId === characterId ? saved.presetId : "") ||
    snapshot.presets.find((item) => item.enabled)?.id || "";
}

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可识别的离线生活");
  const result = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("离线生活格式不正确");
  }
  return result as Record<string, unknown>;
}

function elapsedLabel(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
  return `${Math.floor(minutes / 1440)} 天 ${Math.floor((minutes % 1440) / 60)} 小时`;
}

export const offlineLifeEngine = {
  async prepare(
    characterId: string,
    options: { force?: boolean; signal?: AbortSignal } = {},
  ): Promise<OfflineLifeResult> {
    const settings = aiSettingsRepository.read();
    if (!settings.baseUrl || !settings.model) {
      throw new Error("请先在 AI 设置中填写接口地址和模型");
    }
    const snapshot = libraryRepository.exportSnapshot();
    const character = snapshot.characters.find(
      (item) => item.id === characterId && item.enabled && item.kind !== "user",
    );
    if (!character) throw new Error("请先选择一个可用角色");
    const profile = characterLifeRepository.forCharacter(characterId);
    if (!profile?.enabled) throw new Error("请先开启这位角色的离线生活");
    const due = characterLifeRepository.due(characterId);
    if (!options.force && !due.due) {
      throw new Error("还没有达到设定的离线时长");
    }
    const offlineFrom = options.force
      ? Date.now() - Math.max(30, profile.minOfflineMinutes) * 60_000
      : due.from;
    const offlineTo = Date.now();
    const elapsedMinutes = options.force
      ? Math.max(30, profile.minOfflineMinutes)
      : due.elapsedMinutes;
    const moment = routineMoment(profile, offlineTo);
    const relationship = relationshipRepository.forCharacter(characterId);
    const memories = memoryRepository.forCharacter(characterId);
    const query = `${moment.label} ${moment.description} 离线 ${elapsedLabel(elapsedMinutes)} ${relationship?.summary || ""}`;
    const retrieval = await vectorMemoryEngine.retrieve(
      settings,
      memories,
      query,
      options.signal,
    );
    const recentEvents = lifeTimelineRepository
      .forCharacter(characterId)
      .filter((event) => event.kind !== "offline")
      .slice(0, 8)
      .reverse();
    const saved = contextSessionRepository.read();
    const context = buildContext(
      { ...snapshot, memories },
      {
        characterId,
        presetId: preferredPresetId(characterId),
        moduleId: "offline-life",
        message: query,
        manualWorldbookIds: saved.manualWorldbookIds,
      },
      {
        selectedMemories: retrieval.memories,
        selectedLifeEvents: recentEvents,
        relationshipProfile: relationship,
        lifeProfile: profile,
      },
    );
    const instruction = [
      `兔兔离开了 ${elapsedLabel(elapsedMinutes)}，现在是${moment.label}。`,
      `角色通常会：${moment.description}。`,
      "请根据角色设定、作息、关系和近期生活，生成一件克制、可信、不会抢走用户人生主线的离线活动。",
      profile.proactiveMessages
        ? "角色可以给兔兔发一条自然的主动短信；不要每次都表达强烈思念，也不要声称现实中真的做过无法验证的事情。"
        : "本次不允许主动短信，message 必须为空字符串。",
      "只输出 JSON，不要 Markdown：",
      '{"activityTitle":"短标题","activitySummary":"发生了什么，1至3句","message":"主动短信或空字符串","mood":"简短心情"}',
    ].join("\n");
    const requestMessage: ChatMessage = {
      id: `offline_request_${Date.now()}`,
      role: "user",
      content: "请结算这一段离线生活。",
      createdAt: Date.now(),
    };
    const response = await openAICompatibleAdapter.chat({
      settings: { ...settings, stream: false, temperature: 0.75 },
      systemPrompt: [context.promptPreview, instruction].filter(Boolean).join("\n\n"),
      messages: [requestMessage],
      generation: {
        temperature: 0.75,
        maxTokens: Math.max(300, Math.min(900, settings.maxTokens || 900)),
      },
      signal: options.signal,
    });
    const parsed = parseJson(response);
    const preview: OfflineLifePreview = {
      id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      characterId,
      offlineFrom,
      offlineTo,
      elapsedMinutes,
      routineLabel: `${moment.label} · ${moment.description}`,
      activityTitle: String(parsed.activityTitle || "一段自己的时间").trim().slice(0, 80),
      activitySummary: String(parsed.activitySummary || "角色安静地过了一段自己的生活。").trim().slice(0, 800),
      proactiveMessage: profile.proactiveMessages
        ? String(parsed.message || "").trim().slice(0, 500)
        : "",
      mood: String(parsed.mood || "平静").trim().slice(0, 60),
      createdAt: Date.now(),
    };
    characterLifeRepository.setPending(characterId, preview);
    return {
      preview,
      receipt: contextReceipt.build(context, {
        historyMessages: [requestMessage],
        historyLimit: 1,
      }),
    };
  },

  commit(preview: OfflineLifePreview) {
    const activity = lifeTimelineRepository.save(
      lifeTimelineRepository.create("offline", {
        participantIds: [preview.characterId],
        actor: "character",
        title: preview.activityTitle,
        content: preview.activitySummary,
        mood: preview.mood,
        eventAt: preview.offlineTo,
      }),
    );
    const message = preview.proactiveMessage
      ? lifeTimelineRepository.save(
          lifeTimelineRepository.create("sms", {
            participantIds: [preview.characterId],
            actor: "character",
            title: "角色主动发来短信",
            content: preview.proactiveMessage,
            eventAt: preview.offlineTo,
          }),
        )
      : null;
    characterLifeRepository.settle(preview.characterId);
    return { activity, message };
  },

  discard(characterId: string) {
    characterLifeRepository.settle(characterId);
  },
};
