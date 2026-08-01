export type LifeEventKind =
  | "moment"
  | "sms"
  | "diary"
  | "photo"
  | "couple"
  | "relationship"
  | "offline"
  | "call";

export type LifeEventActor = "user" | "character" | "shared";

export interface LifeEvent {
  id: string;
  schemaVersion: 1;
  kind: LifeEventKind;
  participantIds: string[];
  actor: LifeEventActor;
  title: string;
  content: string;
  media: string;
  mood: string;
  eventAt: number;
  createdAt: number;
  updatedAt: number;
}
