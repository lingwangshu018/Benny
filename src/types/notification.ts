import type { AppId } from "./phone";

export type PhoneNotificationKind = "message" | "sms" | "call" | "system";

export interface PhoneNotification {
  id: string;
  schemaVersion: 1;
  kind: PhoneNotificationKind;
  appId: AppId;
  characterId: string;
  title: string;
  body: string;
  avatar: string;
  read: boolean;
  createdAt: number;
}
