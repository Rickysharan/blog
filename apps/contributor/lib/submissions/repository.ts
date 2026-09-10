import "server-only";

import { createServiceSupabaseClient } from "../supabase/server";
import type { SubmissionCreate, SubmissionSave } from "@omnilede/contracts";
import type { SubmissionRecord, SubmissionRow } from "./types";

export class SubmissionConflictError extends Error {
  override name = "SubmissionConflictError";
}

function shapeSubmission(row: SubmissionRow): SubmissionRecord {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    contentDocument: row.content_document,
    category: row.category,
    region: row.region,
    language: row.language,
    primarySourceName: row.primary_source_name,
    primarySourceUrl: row.primary_source_url,
    privateImagePath: row.private_image_path,
    guidelinesVersion: row.guidelines_version,
    guidelinesAccepted: true,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at
  };
}

const columns = "id,author_id,title,content_document,category,region,language,primary_source_name,primary_source_url,private_image_path,guidelines_version,guidelines_accepted,status,version,created_at,updated_at,submitted_at";

export async function listSubmissions(userId: string): Promise<SubmissionRecord[]> {
  const { data, error } = await createServiceSupabaseClient().from("submissions").select(columns).eq("author_id", userId).order("updated_at", { ascending: false });
  if (error) throw new Error("Unable to load submissions", { cause: error });
  return (data as SubmissionRow[] | null ?? []).map(shapeSubmission);
}

export async function getSubmission(userId: string, submissionId: string): Promise<SubmissionRecord | null> {
  const { data, error } = await createServiceSupabaseClient().from("submissions").select(columns).eq("id", submissionId).eq("author_id", userId).maybeSingle();
  if (error) throw new Error("Unable to load submission", { cause: error });
  return data ? shapeSubmission(data as SubmissionRow) : null;
}

function argsForCreate(userId: string, input: SubmissionCreate): Record<string, unknown> {
  return {
    p_submission_id: input.id,
    p_author_id: userId,
    p_title: input.title,
    p_content_document: input.contentDocument,
    p_category: input.category,
    p_region: input.region,
    p_language: input.language,
    p_primary_source_name: input.primarySourceName,
    p_primary_source_url: input.primarySourceUrl,
    p_private_image_path: input.privateImagePath,
    p_guidelines_version: input.guidelinesVersion,
    p_guidelines_accepted: input.guidelinesAccepted
  };
}

export async function createDraft(userId: string, input: SubmissionCreate): Promise<SubmissionRecord> {
  const { data, error } = await createServiceSupabaseClient().schema("app_private").rpc("create_submission_draft", argsForCreate(userId, input));
  if (error || !data) throw new Error("Unable to create draft", { cause: error ?? undefined });
  return shapeSubmission(data as SubmissionRow);
}

export async function saveSubmission(userId: string, submissionId: string, input: SubmissionSave): Promise<SubmissionRecord> {
  const { data, error } = await createServiceSupabaseClient().schema("app_private").rpc("save_submission", {
    p_submission_id: submissionId,
    p_author_id: userId,
    p_expected_version: input.expectedVersion,
    p_title: input.title,
    p_content_document: input.contentDocument,
    p_category: input.category,
    p_region: input.region,
    p_language: input.language,
    p_primary_source_name: input.primarySourceName,
    p_primary_source_url: input.primarySourceUrl,
    p_private_image_path: input.privateImagePath,
    p_guidelines_version: input.guidelinesVersion,
    p_guidelines_accepted: input.guidelinesAccepted,
    p_submit: input.submit
  });
  if (error?.message.includes("submission_version_conflict")) throw new SubmissionConflictError("This draft changed in another tab");
  if (error || !data) throw new Error("Unable to save submission", { cause: error ?? undefined });
  return shapeSubmission(data as SubmissionRow);
}
