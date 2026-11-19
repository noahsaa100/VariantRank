const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export interface BestPracticeImportSummary {
  rowsFound: number;
  proposedCriteria: number;
  duplicateRowsMerged: number;
  skippedRows: number;
  sheetsProcessed: string[];
}

export interface BestPracticeImportResult {
  id: string;
  status: 'NEEDS_REVIEW';
  fileName: string;
  library: { id: string; name: string; slug: string };
  summary: BestPracticeImportSummary;
}

export interface BestPracticeImportJob {
  id: string;
  fileName: string;
  status: string;
  createdAt: string;
  sourceMetadata: {
    rowsFound?: number;
    uniqueCriteria?: number;
    duplicateRows?: number;
    skippedRows?: number;
    sheetsProcessed?: string[];
  } | null;
  library: { name: string; slug: string };
  publishedVersion: {
    id: string;
    version: number;
    status: string;
    isActive: boolean;
    publishedAt: string | null;
  } | null;
  _count: { candidates: number };
}

export type CandidateStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'MERGED';
export type ScoreCategory = 'SHOPPING_UX' | 'TRUST_CONFIDENCE' | 'OFFER_CLARITY' | 'PURCHASE_EASE' | 'TECHNICAL_ACCESSIBILITY';
export type EvaluationMethod = 'AUTOMATED' | 'AI_ASSISTED' | 'MANUAL' | 'HYBRID';

export interface ImportCandidate {
  id: string;
  status: CandidateStatus;
  sourceSheet: string | null;
  sourceRow: number | null;
  extractionConfidence: number | null;
  proposedCriterion: {
    canonicalKey?: string;
    title?: string;
    description?: string;
    rationale?: string | null;
    guidance?: string | null;
    pageAreas?: string[];
    outcomeMappings?: string[];
    exampleUrls?: string[];
    sourceReferences?: Array<{ sheet?: string; row?: number; metric?: string; outcome?: string }>;
    primaryCategory?: ScoreCategory;
    evaluationMethod?: EvaluationMethod;
  };
}

export interface ImportReview {
  import: BestPracticeImportJob & { errorMessage?: string | null };
  summary: { total: number; statuses: Record<CandidateStatus, number> };
  filters: { outcomes: string[]; pageAreas: string[] };
  pagination: { page: number; pageSize: number; total: number; pages: number };
  candidates: ImportCandidate[];
}

async function responseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return new Error(body?.error || `HTTP ${response.status}`);
}

export async function uploadBestPractices(file: File, libraryName: string) {
  const body = new FormData();
  body.append('file', file);
  body.append('libraryName', libraryName);
  const response = await fetch(`${API_BASE}/data/best-practice-imports`, {
    method: 'POST',
    body,
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<BestPracticeImportResult>;
}

export async function listBestPracticeImports() {
  const response = await fetch(`${API_BASE}/data/best-practice-imports`);
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<BestPracticeImportJob[]>;
}

export async function getBestPracticeImport(id: string, filters: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const response = await fetch(`${API_BASE}/data/best-practice-imports/${id}?${query}`);
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<ImportReview>;
}

export async function updateBestPracticeCandidate(
  importId: string,
  candidateId: string,
  update: Partial<{ status: CandidateStatus; primaryCategory: ScoreCategory; evaluationMethod: EvaluationMethod }>,
) {
  const response = await fetch(`${API_BASE}/data/best-practice-imports/${importId}/candidates/${candidateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function bulkUpdateBestPracticeCandidates(importId: string, candidateIds: string[], status: CandidateStatus) {
  const response = await fetch(`${API_BASE}/data/best-practice-imports/${importId}/candidates`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateIds, status }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function approveAllProposedCandidates(importId: string) {
  const response = await fetch(`${API_BASE}/data/best-practice-imports/${importId}/candidates`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allProposed: true, status: 'APPROVED' }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<{ count: number }>;
}

export async function publishBestPracticeImport(importId: string) {
  const response = await fetch(`${API_BASE}/data/best-practice-imports/${importId}/publish`, { method: 'POST' });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<{ id: string; version: number; _count: { criteria: number } }>;
}

export async function deactivateBestPracticeImport(importId: string) {
  const response = await fetch(`${API_BASE}/data/best-practice-imports/${importId}/deactivate`, { method: 'POST' });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function activateBestPracticeImport(importId: string) {
  const response = await fetch(`${API_BASE}/data/best-practice-imports/${importId}/activate`, { method: 'POST' });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function createBestPracticeRevision(importId: string) {
  const response = await fetch(`${API_BASE}/data/best-practice-imports/${importId}/revisions`, { method: 'POST' });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<{ id: string; status: 'NEEDS_REVIEW'; candidateCount: number }>;
}

export async function deleteBestPracticeImport(importId: string) {
  const response = await fetch(`${API_BASE}/data/best-practice-imports/${importId}`, { method: 'DELETE' });
  if (!response.ok) throw await responseError(response);
}
