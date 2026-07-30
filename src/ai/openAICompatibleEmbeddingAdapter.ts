import type { AISettings } from "../types/ai";

function endpoint(settings: AISettings) {
  const source = settings.embeddingBaseUrl.trim() || settings.baseUrl.trim();
  const clean = source.replace(/\/+$/, "");
  if (!clean) throw new Error("请先填写 Embedding 接口地址");
  if (clean.endsWith("/embeddings")) return clean;
  if (clean.endsWith("/chat/completions")) {
    return `${clean.slice(0, -"/chat/completions".length)}/embeddings`;
  }
  return `${clean}/embeddings`;
}

function normalize(vector: number[]) {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Embedding 接口返回了无效向量");
  }
  return vector.map((value) => value / magnitude);
}

async function errorMessage(response: Response) {
  try {
    const payload = await response.json();
    return (
      payload?.error?.message ||
      payload?.message ||
      `Embedding 接口返回 ${response.status}`
    );
  } catch {
    return `Embedding 接口返回 ${response.status}`;
  }
}

export const openAICompatibleEmbeddingAdapter = {
  modelKey(settings: AISettings) {
    const baseUrl = settings.embeddingBaseUrl.trim() || settings.baseUrl.trim();
    return `${baseUrl.replace(/\/+$/, "")}|${settings.embeddingModel.trim()}`;
  },

  async embed(
    settings: AISettings,
    input: string[],
    signal?: AbortSignal,
  ): Promise<number[][]> {
    if (!settings.embeddingModel.trim()) {
      throw new Error("请先填写 Embedding 模型");
    }
    const response = await fetch(endpoint(settings), {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(settings.apiKey
          ? { Authorization: `Bearer ${settings.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: settings.embeddingModel.trim(),
        input,
      }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = await response.json();
    const rows = Array.isArray(payload?.data)
      ? [...payload.data].sort(
          (left, right) => Number(left?.index ?? 0) - Number(right?.index ?? 0),
        )
      : [];
    if (rows.length !== input.length) {
      throw new Error("Embedding 返回数量与输入不一致");
    }
    return rows.map((row) => {
      if (!Array.isArray(row?.embedding) || row.embedding.length === 0) {
        throw new Error("Embedding 接口没有返回有效向量");
      }
      const vector = row.embedding.map(Number);
      if (vector.some((value: number) => !Number.isFinite(value))) {
        throw new Error("Embedding 向量包含无效数字");
      }
      return normalize(vector);
    });
  },
};
