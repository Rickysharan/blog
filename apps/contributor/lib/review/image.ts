import { validateImage, type ValidatedImage } from "../submissions/image";
import { stageResult, type StageResult } from "./types";

export function runImageSafetyGate(bytes: Uint8Array, mimeType: string, filename: string): StageResult & { image: ValidatedImage | null } {
  try {
    const image = validateImage(bytes, mimeType, filename);
    return { ...stageResult("image_safety", "pass", [], 1), image };
  } catch {
    return { ...stageResult("image_safety", "manual_review", ["image_safety.validation_failed"], null, null, "deterministic-1"), image: null };
  }
}
