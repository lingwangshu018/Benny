export interface AISettings {
  provider: "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  rememberKey: boolean;
  autoMemory: boolean;
  memoryInterval: number;
  memoryLimit: number;
  vectorMemoryEnabled: boolean;
  embeddingBaseUrl: string;
  embeddingModel: string;
  vectorThreshold: number;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface ChatRequest {
  settings: AISettings;
  systemPrompt: string;
  messages: ChatMessage[];
  generation?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };
  signal?: AbortSignal;
  onToken?: (fullText: string) => void;
}
