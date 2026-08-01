import { openAICompatibleAdapter } from "../../ai/openAICompatibleAdapter";
import { buildContext } from "../../context/contextBuilder";
import { vectorMemoryEngine } from "../../memory/vectorMemoryEngine";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import { contextSessionRepository } from "../../storage/contextSessionRepository";
import { libraryRepository } from "../../storage/libraryRepository";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import { memoryRepository } from "../../storage/memoryRepository";
import { relationshipRepository } from "../../storage/relationshipRepository";
import type { ChatMessage } from "../../types/ai";
import type {
  RelationshipGrowthPreview,
  RelationshipMetrics,
  RelationshipStage,
} from "../../types/relationship";

const STAGES: RelationshipStage[] = [
  "stranger",
  "familiar",
  "close",
  "ambiguous",
  "committed",
];

function preferredPresetId(characterId: string) {
  const snapshot = libraryRepository.exportSnapshot();
  const character = snapshot.characters.find((item) => item.id === characterId);
  const saved = contextSessionRepository.read();
  return character?.defaultPresetId ||
    (saved.characterId === characterId ? saved.presetId : "") ||
    snapshot.presets.find((item) => item.enabled)?.id || "";
}

function delta(value: unknown) {
  const number = Number(value);
  return Math.max(-10, Math.min(10, Number.isFinite(number) ? Math.round(number) : 0));
}

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可识别的关系整理结果");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("关系整理结果格式不正确");
  }
  return parsed as Record<string, unknown>;
}

function safeStage(value: unknown, current: RelationshipStage) {
  const requested = STAGES.includes(value as RelationshipStage)
    ? (value as RelationshipStage)
    : current;
  const currentIndex = STAGES.indexOf(current);
  const requestedIndex = STAGES.indexOf(requested);
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, Math.max(currentIndex - 1, Math.min(currentIndex + 1, requestedIndex))))];
}

export const relationshipGrowthEngine = {
  async review(characterId: string, signal?: AbortSignal): Promise<RelationshipGrowthPreview> {
    const settings = aiSettingsRepository.read();
    if (!settings.baseUrl || !settings.model) {
      throw new Error("请先在 AI 设置中填写接口地址和模型");
    }
    const snapshot = libraryRepository.exportSnapshot();
    const character = snapshot.characters.find(
      (item) => item.id === characterId && item.enabled && item.kind !== "user",
    );
    if (!character) throw new Error("请先选择一个可用角色");
    const recentEvents = lifeTimelineRepository
      .forCharacter(characterId)
      .filter((event) => event.kind !== "relationship")
      .slice(0, 20)
      .reverse();
    if (recentEvents.length === 0) {
      throw new Error("还没有共同生活记录，先留下短信、日记、照片或里程碑吧");
    }
    const profile = relationshipRepository.forCharacter(characterId);
    if (!profile) throw new Error("无法建立关系档案");
    const presetId = preferredPresetId(characterId);
    const memories = memoryRepository.forCharacter(characterId);
    const query = recentEvents.map((event) => `${event.title} ${event.content}`).join("\n").slice(-4000);
    const retrieval = await vectorMemoryEngine.retrieve(settings, memories, query, signal);
    const saved = contextSessionRepository.read();
    const context = buildContext(
      { ...snapshot, memories },
      {
        characterId,
        presetId,
        moduleId: "relationship",
        message: query,
        manualWorldbookIds: saved.manualWorldbookIds,
      },
      {
        selectedMemories: retrieval.memories,
        selectedLifeEvents: recentEvents,
        relationshipProfile: profile,
      },
    );
    const instruction = [
      "你是关系档案整理员。只依据已提供的关系档案、记忆和共同生活，评估这段关系是否发生了有证据的变化。",
      "普通互动可以全部为 0；不要为了讨好用户强行升级。阶段最多前进或后退一级。",
      "五项变化均为 -10 到 10 的整数；conflict 正数表示矛盾增加，负数表示缓和。",
      "只输出 JSON，不要 Markdown：",
      '{"title":"本次关系变化标题","reason":"具体依据","stage":"stranger|familiar|close|ambiguous|committed","summary":"更新后的关系概述","impression":"角色对兔兔的当前印象","deltas":{"intimacy":0,"trust":0,"attraction":0,"security":0,"conflict":0}}',
    ].join("\n");
    const message: ChatMessage = {
      id: `relationship_review_${Date.now()}`,
      role: "user",
      content: "请整理这段近期共同生活中的关系变化。",
      createdAt: Date.now(),
    };
    const response = await openAICompatibleAdapter.chat({
      settings: { ...settings, stream: false, temperature: 0.2 },
      systemPrompt: [context.promptPreview, instruction].filter(Boolean).join("\n\n"),
      messages: [message],
      generation: {
        temperature: 0.2,
        maxTokens: Math.max(300, Math.min(1000, settings.maxTokens || 1000)),
      },
      signal,
    });
    const parsed = parseJson(response);
    const rawDeltas = parsed.deltas && typeof parsed.deltas === "object"
      ? (parsed.deltas as Partial<RelationshipMetrics>)
      : {};
    return {
      id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      characterId,
      title: String(parsed.title || "一次关系整理").trim().slice(0, 80),
      reason: String(parsed.reason || "近期共同生活带来了新的理解。").trim().slice(0, 800),
      stage: safeStage(parsed.stage, profile.stage),
      summary: String(parsed.summary || profile.summary).trim().slice(0, 500),
      impression: String(parsed.impression || profile.impression).trim().slice(0, 500),
      deltas: {
        intimacy: delta(rawDeltas.intimacy),
        trust: delta(rawDeltas.trust),
        attraction: delta(rawDeltas.attraction),
        security: delta(rawDeltas.security),
        conflict: delta(rawDeltas.conflict),
      },
      before: profile,
      createdAt: Date.now(),
    };
  },

  commit(preview: RelationshipGrowthPreview) {
    const profile = relationshipRepository.applyGrowth(preview);
    const changes = Object.entries(preview.deltas)
      .filter(([, value]) => value !== 0)
      .map(([key, value]) => `${key} ${value > 0 ? "+" : ""}${value}`)
      .join(" / ");
    lifeTimelineRepository.save(
      lifeTimelineRepository.create("relationship", {
        participantIds: [preview.characterId],
        actor: "shared",
        title: preview.title || "关系档案更新",
        content: [preview.reason, changes ? `变化：${changes}` : "本次关系保持稳定。"].join("\n"),
        mood: profile.stage,
      }),
    );
    return profile;
  },
};
