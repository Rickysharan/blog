import type { ProfileFields } from "@omnilede/contracts";

export type ProfileRecord = ProfileFields & {
  id: string;
  accountStatus: "active" | "suspended" | "banned";
  version: number;
  createdAt: string;
  updatedAt: string;
};
