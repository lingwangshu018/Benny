import { openAICompatibleAdapter } from "../ai/openAICompatibleAdapter";
import type { AISettings, ChatMessage } from "../types/ai";
import type {
  CharacterMemory,
  MemoryCandidate,
  MemoryKind,
} from "../types/memory";

const validKinds = new Set<MemoryKind>([
  "event",
  "relationship",
  "preference",
  "promise",
  "unresolved",
  "other",
]);

function parseJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("记忆整理结果不是有效 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function asCandidate(value: unknown): MemoryCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = String(raw.title ?? "").trim();
  const content = String(raw.content ?? "").trim();
  if (!title || !content) return null;
  const rawKind = String(raw.kind ?? "other") as MemoryKind;
  return {
    kind: validKinds.has(rawKind) ? rawKind : "other",
    title,
    content,
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.map(String).map((item) => item.trim()).filter(Boolean)
      : [],
    importance: Math.max(1, Math.min(5, Number(raw.importance) || 3)),
  };
}

function queryTerms(query: string) {
  const lower = query.toLocaleLowerCase();
  const chunks = lower
    .split(/[\s,，。！？!?、；;：:（）()[\]{}“”"'…]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const cjk = lower.replace(/[^\p{Script=Han}]/gu, "");
  const bigrams: string[] = [];
  for (let index = 0; index < cjk.length - 1; index += 1) {
    bigrams.push(cjk.slice(index, index + 2));
  }
  return [...new Set([...chunks, ...bigrams])];
}

export const memoryEngine = {
  retrieve(
    memories: CharacterMemory[],
    query: string,
    limit: number,
  ): CharacterMemory[] {
    const normalizedQuery = query.toLocaleLowerCase();
    const terms = queryTerms(query);
    return memories
      .filter((memory) => memory.enabled)
      .map((memory) => {
        const title = memory.title.toLocaleLowerCase();
        const content = memory.content.toLocaleLowerCase();
        let relevance = 0;
        for (const keyword of memory.keywords) {
          const normalizedKeyword = keyword.toLocaleLowerCase();
          if (
            normalizedQuery &&
            normalizedKeyword &&
            (normalizedQuery.includes(normalizedKeyword) ||
              normalizedKeyword.includes(normalizedQuery))
          ) {
            relevance += 12;
          }
        }
        for (const term of terms) {
          if (title.includes(term)) relevance += 4;
          if (content.includes(term)) relevance += 2;
        }
        return {
          memory,
          relevance,
          score:
            relevance +
            memory.importance +
            (memory.pinned ? 10 : 0),
        };
      })
      .filter((item) => item.memory.pinned || item.relevance > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, limit))
      .map((item) => item.memory);
  },

  async extract(
    settings: AISettings,
    characterName: string,
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<MemoryCandidate[]> {
    const transcript = messages
      .slice(-16)
      .map(
        (message) =>
          `${message.role === "user" ? "用户" : characterName}：${message.content}`,
      )
      .join("\n");
    const systemPrompt = `你是“异世界连接”的记忆管理员。请从对话中只提取未来仍然有用、明确发生或明确表达的信息。

允许的 kind：
- event：重要事件
- relationship：关系变化
- preference：用户偏好
- promise：承诺约定
- unresolved：未完成话题
- other：其他长期信息

不要保存寒暄、临时措辞、模型猜测或重复内容。最多返回 5 条。
只返回 JSON，不要解释：
{"memories":[{"kind":"event","title":"简短标题","content":"完整而独立的记忆","keywords":["关键词"],"importance":3}]}
没有值得保存的内容时返回：{"memories":[]}`;
    const extractionMessage: ChatMessage = {
      id: `extract_${Date.now()}`,
      role: "user",
      content: `角色：${characterName}\n\n待整理对话：\n${transcript}`,
      createdAt: Date.now(),
    };
    const text = await openAICompatibleAdapter.chat({
      settings: { ...settings, stream: false, temperature: 0.2 },
      systemPrompt,
      messages: [extractionMessage],
      signal,
    });
    const payload = parseJsonObject(text);
    const rawMemories = Array.isArray(payload?.memories)
      ? payload.memories
      : [];
    return rawMemories
      .map((item: unknown) => asCandidate(item))
      .filter(
        (item: MemoryCandidate | null): item is MemoryCandidate =>
          item !== null,
      )
      .slice(0, 5);
  },
};
