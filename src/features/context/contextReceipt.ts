import type { ChatMessage } from "../../types/ai";
import type {
  ContextBundle,
  WorldbookEvaluation,
} from "../../types/context";
import type { MemoryKind } from "../../types/memory";

export interface ContextReceiptItem {
  id: string;
  title: string;
  detail: string;
}

export interface ContextReceipt {
  createdAt: number;
  character: ContextReceiptItem | null;
  userPersona: ContextReceiptItem | null;
  preset: ContextReceiptItem | null;
  relationship: ContextReceiptItem | null;
  routine: ContextReceiptItem | null;
  matchedWorldbooks: ContextReceiptItem[];
  memories: ContextReceiptItem[];
  lifeEvents: ContextReceiptItem[];
  skippedWorldbooks: ContextReceiptItem[];
  historyCount: number;
  historyLimit: number;
  promptLength: number;
  historyLength: number;
  totalLength: number;
}

export interface ContextReceiptOptions {
  historyMessages: Array<Pick<ChatMessage, "content">>;
  historyLimit: number;
}

function joined(values: string[]) {
  return values.filter(Boolean).join("、");
}

const memoryKindLabels: Record<MemoryKind, string> = {
  event: "事件",
  relationship: "关系",
  preference: "偏好",
  promise: "约定",
  unresolved: "待续",
  other: "其他",
};

const relationshipStageLabels = {
  stranger: "初识",
  familiar: "熟悉",
  close: "亲近",
  ambiguous: "暧昧",
  committed: "相守",
} as const;

function includedWorldbookDetail(evaluation: WorldbookEvaluation) {
  if (evaluation.reason === "always") return "常驻读取";
  if (evaluation.reason === "manual-selected") return "已手动启用";
  if (evaluation.matchedKeywords.length > 0) {
    return `命中关键词：${joined(evaluation.matchedKeywords)}`;
  }
  return "已读取";
}

function skippedWorldbookDetail(evaluation: WorldbookEvaluation) {
  const book = evaluation.worldbook;
  if (evaluation.reason === "disabled") return "世界书已停用";
  if (evaluation.reason === "manual-not-selected") return "需要手动启用";
  if (evaluation.reason === "keywords-empty") return "没有配置触发关键词";
  if (evaluation.reason === "keywords-partial") {
    return `需要全部命中，仍缺少：${joined(evaluation.missingKeywords)}`;
  }
  if (evaluation.reason === "probability-miss") {
    return `关键词已命中，但本次未通过 ${book.probability}% 概率判定`;
  }
  if (evaluation.reason === "keywords-no-match") {
    return `未命中关键词：${joined(book.keywords)}`;
  }
  return "本次没有触发";
}

export const contextReceipt = {
  build(
    bundle: ContextBundle,
    options: ContextReceiptOptions,
  ): ContextReceipt {
    const historyLength = options.historyMessages.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    const matchedWorldbooks = bundle.worldbookEvaluations
      .filter((evaluation) => evaluation.included)
      .sort(
        (left, right) =>
          left.worldbook.priority - right.worldbook.priority,
      )
      .map((evaluation) => ({
        id: evaluation.worldbook.id,
        title: evaluation.worldbook.title,
        detail: includedWorldbookDetail(evaluation),
      }));
    const skippedWorldbooks = bundle.worldbookEvaluations
      .filter((evaluation) => !evaluation.included)
      .sort(
        (left, right) =>
          left.worldbook.priority - right.worldbook.priority,
      )
      .map((evaluation) => ({
        id: evaluation.worldbook.id,
        title: evaluation.worldbook.title,
        detail: skippedWorldbookDetail(evaluation),
      }));

    return {
      createdAt: Date.now(),
      character: bundle.character
        ? {
            id: bundle.character.id,
            title: bundle.character.remark || bundle.character.name,
            detail: "角色核心已读取",
          }
        : null,
      userPersona: bundle.userPersona
        ? {
            id: bundle.userPersona.id,
            title: bundle.userPersona.name,
            detail: "用户人设已读取",
          }
        : null,
      preset: bundle.preset
        ? {
            id: bundle.preset.id,
            title: bundle.preset.title,
            detail: "当前预设已读取",
          }
        : null,
      relationship: bundle.relationshipProfile
        ? {
            id: bundle.relationshipProfile.characterId,
            title: "关系档案",
            detail: `阶段 ${relationshipStageLabels[bundle.relationshipProfile.stage]} · 亲密 ${bundle.relationshipProfile.metrics.intimacy} · 信任 ${bundle.relationshipProfile.metrics.trust}`,
          }
        : null,
      routine: bundle.lifeProfile?.enabled
        ? {
            id: bundle.lifeProfile.characterId,
            title: "角色作息",
            detail: bundle.lifeProfile.proactiveMessages
              ? "当前作息已读取 · 允许主动联系"
              : "当前作息已读取 · 不主动联系",
          }
        : null,
      matchedWorldbooks,
      memories: bundle.memories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        detail: `${memoryKindLabels[memory.kind]} · 重要度 ${memory.importance}`,
      })),
      lifeEvents: bundle.lifeEvents.map((event) => ({
        id: event.id,
        title: event.title || "一段共同生活",
        detail: `${new Date(event.eventAt).toLocaleDateString("zh-CN")} · 已读取生活时间线`,
      })),
      skippedWorldbooks,
      historyCount: options.historyMessages.length,
      historyLimit: Math.max(0, options.historyLimit),
      promptLength: bundle.characterCount,
      historyLength,
      totalLength: bundle.characterCount + historyLength,
    };
  },
};
