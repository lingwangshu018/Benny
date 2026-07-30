import { readJson, writeJson } from "./localStorage";

const KEY = "aether.memoryExtractionState";

type ExtractionState = Record<string, number>;

export const memoryExtractionRepository = {
  processedCount(characterId: string) {
    return readJson<ExtractionState>(KEY, {})[characterId] ?? 0;
  },

  markProcessed(characterId: string, messageCount: number) {
    const state = readJson<ExtractionState>(KEY, {});
    writeJson(KEY, { ...state, [characterId]: messageCount });
  },

  reset(characterId: string) {
    const state = readJson<ExtractionState>(KEY, {});
    delete state[characterId];
    writeJson(KEY, state);
  },
};
