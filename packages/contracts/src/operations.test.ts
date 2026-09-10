import { describe, expect, test } from "vitest";

import {
  CATEGORIES,
  PROVIDER_HEALTH,
  REGIONS,
  ROLES,
  SUBMISSION_STATUSES,
  categorySchema,
  providerHealthSchema,
  regionSchema,
  roleSchema,
  submissionStatusSchema
} from "./operations";

describe("shared operation enums", () => {
  test.each(CATEGORIES)("accepts category %s", (value) => {
    expect(categorySchema.parse(value)).toBe(value);
  });

  test.each(SUBMISSION_STATUSES)("accepts submission status %s", (value) => {
    expect(submissionStatusSchema.parse(value)).toBe(value);
  });

  test.each(PROVIDER_HEALTH)("accepts provider health %s", (value) => {
    expect(providerHealthSchema.parse(value)).toBe(value);
  });

  test.each(ROLES)("accepts role %s", (value) => {
    expect(roleSchema.parse(value)).toBe(value);
  });

  test.each(REGIONS)("accepts region %s", (value) => {
    expect(regionSchema.parse(value)).toBe(value);
  });

  test.each([
    ["category", categorySchema],
    ["submission status", submissionStatusSchema],
    ["provider health", providerHealthSchema],
    ["role", roleSchema],
    ["region", regionSchema]
  ] as const)("rejects an unknown %s", (_label, schema) => {
    expect(schema.safeParse("unknown").success).toBe(false);
  });
});
