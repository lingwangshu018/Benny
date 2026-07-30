import { openAICompatibleEmbeddingAdapter } from "../ai/openAICompatibleEmbeddingAdapter";
import { memoryVectorRepository } from "../storage/memoryVectorRepository";
import type { AISettings } from "../types/ai";
import type { CharacterMemory } from "../types/memory";
import type { HybridMemoryResult, MemoryVector } from "../types/vector";
import { memoryEngine } from "./memoryEngine";

function memoryText(memory: CharacterMemory) {
  return [
    memory.title,
    memory.content,
    memory.keywords.join("，"),
  ]
    .filter(Boolean)
    .join("\n");
}

function fingerprint(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function dot(left: number[], right: number[]) {
  if (left.length !== right.length) return -1;
  return left.reduce(
    (sum, value, index) => sum + value * right[index],
    0,
  );
}

async function indexCharacter(
  settings: AISettings,
  memories: CharacterMemory[],
  signal?: AbortSignal,
) {
  if (memories.length === 0) return 0;
  const modelKey = openAICompatibleEmbeddingAdapter.modelKey(settings);
  const existing = await memoryVectorRepository.forCharacter(
    memories[0].characterId,
    modelKey,
  );
  const existingById = new Map(existing.map((item) => [item.memoryId, item]));
  const pending = memories.filter((memory) => {
    const text = memoryText(memory);
    return (
      !existingById.has(memory.id) ||
      existingById.get(memory.id)?.contentFingerprint !== fingerprint(text)
    );
  });

  let indexed = 0;
  for (let offset = 0; offset < pending.length; offset += 16) {
    const batch = pending.slice(offset, offset + 16);
    const embeddings = await openAICompatibleEmbeddingAdapter.embed(
      settings,
      batch.map(memoryText),
      signal,
    );
    const rows: MemoryVector[] = batch.map((memory, index) => ({
      memoryId: memory.id,
      characterId: memory.characterId,
      modelKey,
      contentFingerprint: fingerprint(memoryText(memory)),
      embedding: embeddings[index],
      updatedAt: Date.now(),
    }));
    await memoryVectorRepository.putMany(rows);
    indexed += rows.length;
  }
  return indexed;
}

export const vectorMemoryEngine = {
  async ensureIndexed(
    settings: AISettings,
    memories: CharacterMemory[],
    signal?: AbortSignal,
  ): Promise<number> {
    if (
      !settings.vectorMemoryEnabled ||
      !settings.embeddingModel.trim() ||
      memories.length === 0
    ) {
      return 0;
    }
    const groups = new Map<string, CharacterMemory[]>();
    for (const memory of memories.filter((item) => item.enabled)) {
      const group = groups.get(memory.characterId) ?? [];
      group.push(memory);
      groups.set(memory.characterId, group);
    }
    let indexed = 0;
    for (const group of groups.values()) {
      indexed += await indexCharacter(settings, group, signal);
    }
    return indexed;
  },

  async retrieve(
    settings: AISettings,
    memories: CharacterMemory[],
    query: string,
    signal?: AbortSignal,
  ): Promise<HybridMemoryResult> {
    const lexical = memoryEngine.retrieve(
      memories,
      query,
      settings.memoryLimit,
    );
    if (!settings.vectorMemoryEnabled) {
      return {
        memories: lexical,
        mode: "keyword",
        indexedCount: 0,
        fallbackReason: "",
      };
    }
    if (!settings.embeddingModel.trim() || !query.trim()) {
      return {
        memories: lexical,
        mode: "keyword",
        indexedCount: 0,
        fallbackReason: !settings.embeddingModel.trim()
          ? "尚未设置 Embedding 模型"
          : "",
      };
    }

    try {
      const indexedCount = await this.ensureIndexed(
        settings,
        memories,
        signal,
      );
      const modelKey = openAICompatibleEmbeddingAdapter.modelKey(settings);
      const vectors = await memoryVectorRepository.forCharacter(
        memories[0]?.characterId ?? "",
        modelKey,
      );
      const queryVector = (
        await openAICompatibleEmbeddingAdapter.embed(settings, [query], signal)
      )[0];
      const vectorsById = new Map(
        vectors.map((item) => [item.memoryId, item.embedding]),
      );
      const lexicalRank = new Map(
        lexical.map((memory, index) => [
          memory.id,
          (lexical.length - index) / Math.max(1, lexical.length),
        ]),
      );
      const ranked = memories
        .filter((memory) => memory.enabled && vectorsById.has(memory.id))
        .map((memory) => {
          const similarity = dot(
            vectorsById.get(memory.id) ?? [],
            queryVector,
          );
          const lexicalScore = lexicalRank.get(memory.id) ?? 0;
          return {
            memory,
            similarity,
            score:
              similarity * 0.68 +
              lexicalScore * 0.2 +
              (memory.pinned ? 0.08 : 0) +
              (memory.importance / 5) * 0.04,
          };
        })
        .filter(
          (item) =>
            item.similarity >= settings.vectorThreshold ||
            lexicalRank.has(item.memory.id) ||
            item.memory.pinned,
        )
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(1, settings.memoryLimit))
        .map((item) => item.memory);

      return {
        memories: ranked.length ? ranked : lexical,
        mode: ranked.length ? "hybrid" : "keyword",
        indexedCount,
        fallbackReason: "",
      };
    } catch (caught) {
      return {
        memories: lexical,
        mode: "keyword",
        indexedCount: 0,
        fallbackReason:
          caught instanceof Error ? caught.message : "向量检索不可用",
      };
    }
  },
};
