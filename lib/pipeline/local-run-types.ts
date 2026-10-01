export const LOCAL_RUN_STAGES = [
  "preflight",
  "discovery",
  "generation",
  "article-normalization",
  "image-selection",
  "local-validation",
  "dashboard-delivery",
  "delivery-verification",
] as const;

export type LocalRunStage = (typeof LOCAL_RUN_STAGES)[number];

export const RECOVERY_CATEGORIES = [
  "configuration",
  "credentials",
  "disk-space",
  "already-running",
  "local-model-missing",
  "local-model-unavailable",
  "discovery-unavailable",
  "generation-invalid",
  "generation-unavailable",
  "insufficient-images",
  "validation-failed",
  "network",
  "rate-limited",
  "remote-service",
  "authentication",
  "permission",
  "published-conflict",
  "content-conflict",
  "cancelled",
  "unknown",
] as const;

export type RecoveryCategory = (typeof RECOVERY_CATEGORIES)[number];

export interface LocalDraftRef {
  category: string;
  filename: string;
}

export type LocalRunStatus =
  | "running"
  | "completed"
  | "human-required"
  | "cancelled";

export type DeliveryStatus = "pending" | "delivered" | "not-delivered";

export interface LocalRunState {
  version: 1;
  runId: string;
  status: LocalRunStatus;
  stage: LocalRunStage;
  attempt: number;
  percent: number;
  message: string;
  draftRef?: LocalDraftRef;
  imageCount: number;
  repairs: string[];
  errorCategory?: RecoveryCategory;
  deliveryStatus: DeliveryStatus;
  selectedStory?: {
    title: string;
    source: string;
    sourceUrl: string;
    date: string;
    snippet: string;
    category: string;
  };
  startedAt: string;
  updatedAt: string;
}

interface LocalWriterEventBase {
  runId: string;
  stage: LocalRunStage;
  attempt: number;
  percent: number;
  message: string;
  draftRef?: LocalDraftRef;
  imageCount: number;
  repairs: string[];
}

export type LocalWriterEvent =
  | (LocalWriterEventBase & { status: "started" | "progress" | "repaired" })
  | (LocalWriterEventBase & {
      status: "retrying" | "human-required" | "failed";
      errorCategory: RecoveryCategory;
    })
  | (LocalWriterEventBase & {
      status: "completed";
      deliveryStatus: "delivered";
    })
  | (LocalWriterEventBase & {
      status: "cancelled";
      errorCategory: "cancelled";
    });

interface LocalRunResultBase {
  runId: string;
  stage: LocalRunStage;
  draftRef?: LocalDraftRef;
  imageCount: number;
  repairs: string[];
  message: string;
}

export type LocalRunResult =
  | (LocalRunResultBase & {
      status: "completed";
      deliveryStatus: "delivered";
    })
  | (LocalRunResultBase & {
      status: "human-required" | "failed";
      deliveryStatus: "not-delivered";
      errorCategory: RecoveryCategory;
      resumable: boolean;
    })
  | (LocalRunResultBase & {
      status: "cancelled";
      deliveryStatus: "not-delivered";
      errorCategory: "cancelled";
      resumable: true;
    });
