export type RelationshipStage =
  | "stranger"
  | "familiar"
  | "close"
  | "ambiguous"
  | "committed";

export interface RelationshipMetrics {
  intimacy: number;
  trust: number;
  attraction: number;
  security: number;
  conflict: number;
}

export interface RelationshipProfile {
  characterId: string;
  schemaVersion: 1;
  stage: RelationshipStage;
  metrics: RelationshipMetrics;
  summary: string;
  impression: string;
  createdAt: number;
  updatedAt: number;
  lastReviewedAt: number;
}

export interface RelationshipGrowthPreview {
  id: string;
  characterId: string;
  title: string;
  reason: string;
  stage: RelationshipStage;
  summary: string;
  impression: string;
  deltas: RelationshipMetrics;
  before: RelationshipProfile;
  createdAt: number;
}
