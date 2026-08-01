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

export interface ChatVoiceAttachment {
  kind: "voice";
  reference: string;
  mimeType: string;
  size: number;
  durationMs: number;
}

export interface ChatMessageVersion {
  id: string;
  content: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  versions?: ChatMessageVersion[];
  activeVersion?: number;
  channel?: "chat" | "call";
  voice?: ChatVoiceAttachment;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface CharacterChatState {
  activeSessionId: string;
  sessions: ChatSession[];
}

export interface ChatSearchHit {
  sessionId: string;
  sessionTitle: string;
  messageId: string;
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
