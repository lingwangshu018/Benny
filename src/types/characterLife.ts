export type RoutineMode = "early" | "regular" | "night-owl";

export interface RoutineNotes {
  morning: string;
  daytime: string;
  evening: string;
  night: string;
}

export interface OfflineLifePreview {
  id: string;
  characterId: string;
  offlineFrom: number;
  offlineTo: number;
  elapsedMinutes: number;
  routineLabel: string;
  activityTitle: string;
  activitySummary: string;
  proactiveMessage: string;
  mood: string;
  createdAt: number;
}

export interface CharacterLifeProfile {
  characterId: string;
  schemaVersion: 1;
  enabled: boolean;
  proactiveMessages: boolean;
  autoPrepare: boolean;
  minOfflineMinutes: number;
  routineMode: RoutineMode;
  notes: RoutineNotes;
  lastSeenAt: number;
  lastSettledAt: number;
  pending: OfflineLifePreview | null;
  createdAt: number;
  updatedAt: number;
}

export interface OfflineDue {
  due: boolean;
  elapsedMinutes: number;
  from: number;
  to: number;
}
