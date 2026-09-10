import type { SubmissionInput, SubmissionStatus, EditorDocument, Category, Region } from "@omnilede/contracts";

export type SubmissionRecord = SubmissionInput & {
  id: string;
  authorId: string;
  status: SubmissionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type SubmissionRow = {
  id: string;
  author_id: string;
  title: string;
  content_document: EditorDocument;
  category: Category;
  region: Region;
  language: string;
  primary_source_name: string;
  primary_source_url: string;
  private_image_path: string;
  guidelines_version: string;
  guidelines_accepted: boolean;
  status: SubmissionStatus;
  version: number;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
};
