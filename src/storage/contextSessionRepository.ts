import type { ContextRequest } from "../types/context";
import { readJson, writeJson } from "./localStorage";

const KEY = "aether.contextSession";

const EMPTY_SESSION: ContextRequest = {
  characterId: "",
  presetId: "",
  moduleId: "chat",
  message: "",
  manualWorldbookIds: [],
};

export const contextSessionRepository = {
  read(): ContextRequest {
    return {
      ...EMPTY_SESSION,
      ...readJson<Partial<ContextRequest>>(KEY, EMPTY_SESSION),
    };
  },

  save(session: ContextRequest) {
    writeJson(KEY, session);
  },
};
