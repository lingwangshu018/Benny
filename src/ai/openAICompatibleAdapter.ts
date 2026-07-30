import type { AISettings, ChatRequest } from "../types/ai";

function endpoint(baseUrl: string, path: "chat/completions" | "models") {
  const clean = baseUrl.trim().replace(/\/+$/, "");
  if (!clean) throw new Error("请先填写接口地址");
  if (path === "chat/completions" && clean.endsWith("/chat/completions")) {
    return clean;
  }
  if (path === "models" && clean.endsWith("/chat/completions")) {
    return `${clean.slice(0, -"/chat/completions".length)}/models`;
  }
  return `${clean}/${path}`;
}

function headers(settings: AISettings) {
  return {
    "Content-Type": "application/json",
    ...(settings.apiKey
      ? { Authorization: `Bearer ${settings.apiKey}` }
      : {}),
  };
}

async function errorMessage(response: Response) {
  try {
    const body = await response.json();
    return (
      body?.error?.message ||
      body?.message ||
      `模型接口返回 ${response.status}`
    );
  } catch {
    return `模型接口返回 ${response.status}`;
  }
}

async function readStream(
  response: Response,
  onToken?: (fullText: string) => void,
) {
  if (!response.body) throw new Error("模型没有返回可读取的数据流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        const token = payload?.choices?.[0]?.delta?.content;
        if (typeof token === "string") {
          fullText += token;
          onToken?.(fullText);
        }
      } catch {
        // Some compatible providers send keep-alive lines that are not JSON.
      }
    }
  }
  return fullText;
}

export const openAICompatibleAdapter = {
  async listModels(settings: AISettings): Promise<string[]> {
    const response = await fetch(endpoint(settings.baseUrl, "models"), {
      headers: headers(settings),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = await response.json();
    return (Array.isArray(payload?.data) ? payload.data : [])
      .map((item: { id?: unknown }) => String(item?.id ?? "").trim())
      .filter(Boolean)
      .sort();
  },

  async chat({
    settings,
    systemPrompt,
    messages,
    generation,
    signal,
    onToken,
  }: ChatRequest): Promise<string> {
    if (!settings.model.trim()) throw new Error("请先选择或填写模型名称");
    const response = await fetch(
      endpoint(settings.baseUrl, "chat/completions"),
      {
        method: "POST",
        headers: headers(settings),
        signal,
        body: JSON.stringify({
          model: settings.model.trim(),
          messages: [
            ...(systemPrompt.trim()
              ? [{ role: "system", content: systemPrompt.trim() }]
              : []),
            ...messages.map(({ role, content }) => ({ role, content })),
          ],
          temperature: generation?.temperature ?? settings.temperature,
          ...(generation?.topP === undefined
            ? {}
            : { top_p: generation.topP }),
          max_tokens: generation?.maxTokens ?? settings.maxTokens,
          stream: settings.stream,
        }),
      },
    );
    if (!response.ok) throw new Error(await errorMessage(response));

    if (settings.stream) {
      const text = await readStream(response, onToken);
      if (!text) throw new Error("模型完成了请求，但没有返回文字");
      return text;
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("模型完成了请求，但没有返回文字");
    }
    onToken?.(content);
    return content;
  },
};
