import { openAICompatibleAdapter } from "../../ai/openAICompatibleAdapter";
import { buildContext } from "../../context/contextBuilder";
import {
  contextReceipt,
  type ContextReceipt,
} from "../context/contextReceipt";
import { vectorMemoryEngine } from "../../memory/vectorMemoryEngine";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import { contextSessionRepository } from "../../storage/contextSessionRepository";
import { libraryRepository } from "../../storage/libraryRepository";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import { memoryRepository } from "../../storage/memoryRepository";
import { relationshipRepository } from "../../storage/relationshipRepository";
import { characterLifeRepository } from "../../storage/characterLifeRepository";
import type { ChatMessage } from "../../types/ai";
import type { LifeEvent } from "../../types/life";

export interface SmsReplyRequest {
  characterId: string;
  message: string;
  sourceEventId?: string;
  signal?: AbortSignal;
  onToken?: (fullText: string) => void;
}

export interface SmsReplyResult {
  text: string;
  receipt: ContextReceipt;
  memoryStatus: string;
}

function smsMessage(event: LifeEvent): ChatMessage | null {
  if (event.kind !== "sms" || event.actor === "shared") return null;
  return {
    id: event.id,
    role: event.actor === "character" ? "assistant" : "user",
    content: event.content,
    createdAt: event.eventAt,
  };
}

function preferredPresetId(characterId: string) {
  const snapshot = libraryRepository.exportSnapshot();
  const character = snapshot.characters.find(
    (item) => item.id === characterId && item.enabled,
  );
  const session = contextSessionRepository.read();
  const preferred =
    character?.defaultPresetId ||
    (session.characterId === characterId ? session.presetId : "");
  const appliesToSms = (item: (typeof snapshot.presets)[number]) =>
    item.enabled &&
    (item.scope === "global" ||
      (item.scope === "character" && item.scopeIds.includes(characterId)) ||
      (item.scope === "module" && item.scopeIds.includes("sms")));
  if (
    snapshot.presets.some(
      (item) => item.id === preferred && appliesToSms(item),
    )
  ) {
    return preferred;
  }
  return snapshot.presets.find(appliesToSms)?.id ?? "";
}

function modelHistory(
  events: LifeEvent[],
  request: SmsReplyRequest,
  limit: number,
) {
  const messages = events
    .filter((event) => event.kind === "sms")
    .reverse()
    .map(smsMessage)
    .filter((message): message is ChatMessage => message !== null);
  if (
    !request.sourceEventId ||
    !messages.some((message) => message.id === request.sourceEventId)
  ) {
    messages.push({
      id: `sms_request_${Date.now()}`,
      role: "user",
      content: request.message.trim(),
      createdAt: Date.now(),
    });
  }
  return messages.slice(-Math.max(1, Math.min(24, limit || 16)));
}

function memoryStatus(
  mode: "keyword" | "hybrid",
  count: number,
  fallbackReason: string,
) {
  if (fallbackReason) return `向量检索已回退：${fallbackReason}`;
  return mode === "hybrid"
    ? `混合检索命中 ${count} 条记忆`
    : `关键词检索命中 ${count} 条记忆`;
}

export const lifeInteractionEngine = {
  async generateSmsReply(
    request: SmsReplyRequest,
  ): Promise<SmsReplyResult> {
    const message = request.message.trim();
    if (!request.characterId) throw new Error("请先选择联系人");
    if (!message) throw new Error("短信内容不能为空");

    const settings = aiSettingsRepository.read();
    if (!settings.baseUrl || !settings.model) {
      throw new Error("请先在 AI 设置中填写接口地址和模型");
    }

    const snapshot = libraryRepository.exportSnapshot();
    const character = snapshot.characters.find(
      (item) =>
        item.id === request.characterId &&
        item.enabled &&
        item.kind !== "user",
    );
    if (!character) throw new Error("当前联系人没有可用的角色档案");

    const presetId = preferredPresetId(character.id);
    const preset = snapshot.presets.find((item) => item.id === presetId);
    const memories = memoryRepository.forCharacter(character.id);
    const retrieval = await vectorMemoryEngine.retrieve(
      settings,
      memories,
      message,
      request.signal,
    );
    const characterEvents = lifeTimelineRepository.forCharacter(character.id);
    const recentLifeEvents = characterEvents
      .filter((event) => event.kind !== "sms")
      .slice(0, 6)
      .reverse();
    const historyLimit =
      character.contextLimit || preset?.historyLimit || 16;
    const messages = modelHistory(characterEvents, request, historyLimit);
    const savedSession = contextSessionRepository.read();
    const context = buildContext(
      { ...snapshot, memories },
      {
        characterId: character.id,
        presetId,
        moduleId: "sms",
        message,
        manualWorldbookIds: savedSession.manualWorldbookIds,
      },
      {
        memoryLimit: preset?.memoryLimit || settings.memoryLimit,
        selectedMemories: retrieval.memories,
        selectedLifeEvents: recentLifeEvents,
        relationshipProfile: relationshipRepository.forCharacter(character.id),
        lifeProfile: characterLifeRepository.forCharacter(character.id),
      },
    );
    const sceneInstruction = `【生活场景 · 短信】
你正在以“${character.remark || character.name}”的身份回复用户刚发来的短信。
请延续短信历史，并自然内化角色档案、世界书、相关记忆与共同生活。
回复应像真实短信，避免旁白、动作描写、角色名前缀、引号、Markdown 和解释。
只输出这一次要发出的短信正文。`;
    const text = await openAICompatibleAdapter.chat({
      settings,
      systemPrompt: [context.promptPreview, sceneInstruction]
        .filter(Boolean)
        .join("\n\n"),
      messages,
      generation: context.preset
        ? {
            temperature: context.preset.temperature ?? undefined,
            topP: context.preset.topP ?? undefined,
            maxTokens: context.preset.maxTokens ?? undefined,
          }
        : undefined,
      signal: request.signal,
      onToken: request.onToken,
    });

    return {
      text: text.trim(),
      receipt: contextReceipt.build(context, {
        historyMessages: messages,
        historyLimit: Math.max(1, Math.min(24, historyLimit || 16)),
      }),
      memoryStatus: memoryStatus(
        retrieval.mode,
        retrieval.memories.length,
        retrieval.fallbackReason,
      ),
    };
  },
};
