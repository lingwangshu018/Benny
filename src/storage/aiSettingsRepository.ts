import type { AISettings } from "../types/ai";
import { readJson, writeJson } from "./localStorage";

const SETTINGS_KEY = "aether.aiSettings";
const SESSION_KEY = "aether.aiSessionKey";

const defaults: AISettings = {
  provider: "openai-compatible",
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: 0.8,
  maxTokens: 1200,
  stream: true,
  rememberKey: false,
  autoMemory: true,
  memoryInterval: 4,
  memoryLimit: 6,
  vectorMemoryEnabled: false,
  embeddingBaseUrl: "",
  embeddingModel: "",
  vectorThreshold: 0.45,
};

type StoredSettings = Omit<AISettings, "apiKey"> & { apiKey?: string };

export const aiSettingsRepository = {
  read(): AISettings {
    const stored = readJson<Partial<StoredSettings>>(SETTINGS_KEY, {});
    const rememberKey = stored.rememberKey === true;
    return {
      ...defaults,
      ...stored,
      rememberKey,
      apiKey: rememberKey
        ? String(stored.apiKey ?? "")
        : window.sessionStorage.getItem(SESSION_KEY) ?? "",
    };
  },

  save(settings: AISettings) {
    const stored: StoredSettings = {
      ...settings,
      apiKey: settings.rememberKey ? settings.apiKey : undefined,
    };
    writeJson(SETTINGS_KEY, stored);
    if (settings.rememberKey) {
      window.sessionStorage.removeItem(SESSION_KEY);
    } else if (settings.apiKey) {
      window.sessionStorage.setItem(SESSION_KEY, settings.apiKey);
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  },
};
