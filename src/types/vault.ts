import type { CharacterChatState } from "./ai";
import type {
  CharacterCard,
  PromptPreset,
  WorldbookEntry,
} from "./library";
import type { CharacterMemory } from "./memory";
import type { LifeEvent } from "./life";
import type { RelationshipProfile } from "./relationship";
import type { CharacterLifeProfile } from "./characterLife";
import type { BeautySettings } from "./beauty";
import type { PhoneNotification } from "./notification";

export interface VaultAlbumAsset {
  id: string;
  mimeType: string;
  size: number;
  createdAt: number;
  data: string;
}

export interface VaultVoiceAsset extends VaultAlbumAsset {}

export interface VaultBeautyWallpaper extends VaultAlbumAsset {}

export interface VaultPayload {
  characters: CharacterCard[];
  worldbooks: WorldbookEntry[];
  presets: PromptPreset[];
  chats: {
    schemaVersion: 2;
    characters: Record<string, CharacterChatState>;
  };
  memories: CharacterMemory[];
  memoryExtractionState: Record<string, number>;
  timeline: LifeEvent[];
  relationshipProfiles: RelationshipProfile[];
  characterLifeProfiles: CharacterLifeProfile[];
  albumAssets: VaultAlbumAsset[];
  voiceAssets: VaultVoiceAsset[];
  beautySettings: BeautySettings;
  beautyWallpaper: VaultBeautyWallpaper | null;
  notifications: PhoneNotification[];
}

export interface VaultArchive {
  kind: "bunny-data-vault";
  schemaVersion: 1;
  appVersion: "0.16" | "0.17" | "0.19" | "0.20" | "0.21" | "0.22" | "0.23";
  createdAt: number;
  payload: VaultPayload;
  integrity: {
    algorithm: "SHA-256";
    digest: string;
  };
}

export interface VaultCounts {
  characters: number;
  worldbooks: number;
  presets: number;
  chatCharacters: number;
  chatSessions: number;
  chatMessages: number;
  memories: number;
  timelineEvents: number;
  relationshipProfiles: number;
  characterLifeProfiles: number;
  albumAssets: number;
  voiceAssets: number;
  beautyAssets: number;
  notifications: number;
}

export interface VaultIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface VaultInspection {
  valid: boolean;
  archive: VaultArchive | null;
  counts: VaultCounts;
  issues: VaultIssue[];
  containsSensitiveFields: boolean;
  byteSize: number;
}

export interface VaultStorageUsage {
  bunnyBytes: number;
  previousBackupBytes: number;
  originUsageBytes: number | null;
  originQuotaBytes: number | null;
  categories: Array<{
    label: string;
    bytes: number;
  }>;
}
