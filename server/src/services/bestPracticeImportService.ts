import { createHash } from 'node:crypto';
import { parseBestPracticeDocument } from './bestPracticeDocumentParser';
import type { NeutralBestPracticeRow } from './bestPracticeDocumentParser';
import {
  structureBestPracticeChecklistWithAi,
  type StructuredBestPracticeDefinition,
} from './aiAssistService';
import {
  BusinessOutcomeKey,
  CriterionEvaluationMethod,
  ImportCandidateStatus,
  ImportJobStatus,
  LibraryVersionStatus,
  Prisma,
  PrismaClient,
  ScoreCategoryKey,
} from '@prisma/client';

const prisma = new PrismaClient();

const STANDARD_SHEETS: Record<string, string> = {
  'Increase ATC %': 'INCREASE_ATC',
  'Increase Product View %': 'INCREASE_PRODUCT_VIEWS',
  'Increase Conversion %': 'INCREASE_CONVERSION',
  'Increase AOV': 'INCREASE_AOV',
  'Enhancing Brand Perception': 'ENHANCE_BRAND_PERCEPTION',
  'Decrease Site Abandonment': 'DECREASE_SITE_ABANDONMENT',
  'Web Accessibility': 'WEB_ACCESSIBILITY',
};

interface SourceRow {
  sheet: string;
  row: number;
  title?: string;
  outcome: string;
  metric: string;
  pageArea: string;
  description: string;
  rationale: string | null;
  notes: string | null;
  exampleUrl: string | null;
  hasScreenshot: boolean;
  includedInCakeTheme: boolean | null;
  customWorkRequired: boolean | null;
  integrationRequired: boolean | null;
  clientResponsibility: boolean | null;
  aiDefinition?: StructuredBestPracticeDefinition;
  statusDefinitions?: {
    good?: string;
    canBeImproved?: string;
    bad?: string;
    notApplicable?: string;
  };
}

export interface ExtractedImportCandidate {
  canonicalKey: string;
  sourceSheet: string;
  sourceRow: number;
  rawData: Prisma.InputJsonValue;
  proposedCriterion: Prisma.InputJsonValue;
  extractionConfidence: number;
  sourceCount: number;
}

export interface WorkbookExtraction {
  rowsFound: number;
  uniqueCriteria: number;
  duplicateRows: number;
  skippedRows: number;
  sheetsProcessed: string[];
  candidates: ExtractedImportCandidate[];
}

function normalizeCriterion(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalKey(description: string): string {
  const normalized = normalizeCriterion(description);
  return `criterion_${createHash('sha256').update(normalized).digest('hex').slice(0, 16)}`;
}

function titleFromDescription(description: string): string {
  if (description.length <= 140) return description;
  const shortened = description.slice(0, 137);
  const lastSpace = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, lastSpace > 100 ? lastSpace : 137).trim()}...`;
}

function normalizeOutcome(value: string | null | undefined): string {
  if (!value) return '';
  const normalized = normalizeCriterion(value);
  const match = Object.entries(STANDARD_SHEETS).find(([label]) => normalizeCriterion(label) === normalized);
  if (match) return match[1];
  if (/accessib/.test(normalized)) return 'WEB_ACCESSIBILITY';
  if (/average order|\baov\b/.test(normalized)) return 'INCREASE_AOV';
  if (/add to cart|\batc\b/.test(normalized)) return 'INCREASE_ATC';
  if (/product view/.test(normalized)) return 'INCREASE_PRODUCT_VIEWS';
  if (/conversion|purchase/.test(normalized)) return 'INCREASE_CONVERSION';
  if (/brand|trust|confidence/.test(normalized)) return 'ENHANCE_BRAND_PERCEPTION';
  if (/abandon/.test(normalized)) return 'DECREASE_SITE_ABANDONMENT';
  if (/thank you/.test(normalized)) return 'THANK_YOU_PAGE';
  return '';
}

function questionHeading(value: string): string | null {
  const cleaned = value.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, ' ').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(?:\d+[.)]\s*)?([^?]{12,220}\?)/);
  return match?.[1].trim() ?? null;
}

function tokenSimilarity(left: string, right: string): number {
  const tokens = (value: string) => new Set(normalizeCriterion(value).split(' ').filter((token) => token.length > 2));
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  const shared = [...a].filter((token) => b.has(token)).length;
  return (2 * shared) / (a.size + b.size);
}

function prepareChecklistRows(rows: NeutralBestPracticeRow[], format: string) {
  const headings = rows.map((row) => questionHeading(row.description));
  const questionRatio = headings.filter(Boolean).length / Math.max(rows.length, 1);
  if (!['PDF', 'DOCX', 'TXT', 'MD', 'MARKDOWN'].includes(format) || questionRatio < 0.4) {
    return { rows, skipped: 0, duplicates: 0 };
  }

  // Checklist documents frequently contain a short contents list followed by
  // the same numbered checks with detailed rationale. Group by the canonical
  // question and retain the richest occurrence before spending AI tokens.
  const grouped: Array<{ question: string; rows: NeutralBestPracticeRow[] }> = [];
  let skipped = 0;
  rows.forEach((row, index) => {
    const question = headings[index];
    if (!question) { skipped += 1; return; }
    const existing = grouped.find((group) =>
      normalizeCriterion(group.question) === normalizeCriterion(question)
      || tokenSimilarity(group.question, question) >= 0.94);
    if (existing) existing.rows.push(row);
    else grouped.push({ question, rows: [row] });
  });

  const prepared = grouped.map((group, index) => {
    const richest = [...group.rows].sort((a, b) => b.description.length - a.description.length)[0];
    const detail = richest.description.replace(/^(?:\d+[.)]\s*)?[^?]{12,220}\?\s*/, '').trim();
    return {
      ...richest,
      row: index + 1,
      title: group.question,
      description: detail ? `${group.question}\n\nSupporting source detail:\n${detail}` : group.question,
      metadata: {
        ...(richest.metadata ?? {}),
        sourceOccurrences: group.rows.map((row) => ({ source: row.source, row: row.row })),
        duplicateOccurrencesMerged: Math.max(0, group.rows.length - 1),
      },
    };
  });
  return {
    rows: prepared,
    skipped,
    duplicates: rows.length - skipped - prepared.length,
  };
}

export async function extractDocumentCandidates(input: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<WorkbookExtraction> {
  const document = await parseBestPracticeDocument(input);
  const preparedDocument = prepareChecklistRows(document.rows, document.format);
  const proseFormat = ['PDF', 'DOCX', 'TXT', 'MD', 'MARKDOWN'].includes(document.format);
  const structuredDefinitions = proseFormat
    ? await structureBestPracticeChecklistWithAi(preparedDocument.rows.map((row, sourceIndex) => ({
      sourceIndex,
      section: row.source,
      text: row.description,
    })))
    : [];
  const definitionByIndex = new Map(structuredDefinitions.map((definition) => [definition.sourceIndex, definition]));
  const sourceRows: SourceRow[] = preparedDocument.rows.map((row, sourceIndex) => ({
    sheet: row.source,
    row: row.row,
    title: row.title,
    outcome: normalizeOutcome(row.outcome),
    metric: row.outcome || row.source,
    pageArea: row.pageArea || 'Unspecified',
    description: row.description,
    rationale: row.rationale ?? null,
    notes: row.guidance ?? null,
    exampleUrl: row.exampleUrl ?? null,
    hasScreenshot: false,
    includedInCakeTheme: null,
    customWorkRequired: null,
    integrationRequired: null,
    clientResponsibility: null,
    aiDefinition: definitionByIndex.get(sourceIndex),
    statusDefinitions: row.statusDefinitions,
  }));
  const sheetsProcessed = document.sections;

  if (sourceRows.length === 0) {
    throw new Error('No recognisable best-practice checks were found. Use a table with a Description, Criterion, Check or Best Practice column, or a document containing clear recommendations.');
  }

  const grouped = new Map<string, SourceRow[]>();
  for (const row of sourceRows) {
    const normalized = normalizeCriterion(row.description);
    if (!normalized) continue;
    grouped.set(normalized, [...(grouped.get(normalized) ?? []), row]);
  }

  const candidates = [...grouped.values()].map((sources): ExtractedImportCandidate => {
    const first = sources[0];
    const outcomes = [...new Set(sources.map((source) => source.outcome).filter(Boolean))];
    const pageAreas = [...new Set(sources.map((source) => source.pageArea).filter((area) => area !== 'Unspecified'))];
    const rationales = [...new Set(sources.map((source) => source.rationale).filter(Boolean))];
    const notes = [...new Set(sources.map((source) => source.notes).filter(Boolean))];
    const exampleUrls = [...new Set(sources.map((source) => source.exampleUrl).filter(Boolean))];
    const key = canonicalKey(first.description);

    return {
      canonicalKey: key,
      sourceSheet: first.sheet,
      sourceRow: first.row,
      sourceCount: sources.length,
      extractionConfidence: first.description && first.pageArea ? 1 : 0.8,
      rawData: { sourceRows: sources } as unknown as Prisma.InputJsonValue,
      proposedCriterion: {
        canonicalKey: key,
        title: first.aiDefinition?.title ?? first.title ?? titleFromDescription(first.description),
        description: first.aiDefinition?.description ?? first.description,
        rationale: first.aiDefinition?.rationale ?? (rationales.join('\n\n') || null),
        guidance: notes.join('\n\n') || null,
        pageAreas: first.aiDefinition?.pageAreas.length ? first.aiDefinition.pageAreas : pageAreas,
        outcomeMappings: outcomes,
        exampleUrls,
        hasScreenshotEvidence: sources.some((source) => source.hasScreenshot),
        implementation: {
          includedInCakeTheme: sources.some((source) => source.includedInCakeTheme === true),
          customWorkRequired: sources.some((source) => source.customWorkRequired === true),
          integrationRequired: sources.some((source) => source.integrationRequired === true),
          clientResponsibility: sources.some((source) => source.clientResponsibility === true),
        },
        sourceReferences: sources.map(({ sheet, row, metric, outcome }) => ({ sheet, row, metric, outcome })),
        statusDefinitions: first.aiDefinition ? {
          good: first.aiDefinition.good,
          canBeImproved: first.aiDefinition.canBeImproved,
          bad: first.aiDefinition.bad,
          notApplicable: first.aiDefinition.notApplicable,
        } : first.statusDefinitions,
        primaryCategory: first.aiDefinition?.category,
        evaluationMethod: first.aiDefinition?.evaluationMethod,
        applicability: {
          pageAreas: first.aiDefinition?.pageAreas.length ? first.aiDefinition.pageAreas : pageAreas,
          scope: (first.aiDefinition?.pageAreas.length || pageAreas.length > 0) ? 'PAGE_SCOPED' : 'SITE_OR_PAGE',
        },
        evidenceRequirements: {
          source: 'IMPORTED_BEST_PRACTICE',
          evidenceType: first.aiDefinition ? 'AI_STRUCTURED_DEFINITION' : 'INFERRED_ON_PUBLISH',
          requiresRenderedPage: true,
          evidenceNeeded: first.aiDefinition?.evidenceNeeded ?? [],
          evidenceSource: first.aiDefinition?.evidenceSource ?? 'PAGE',
          evaluableFromWebsite: !['EXTERNAL_BUSINESS_DATA', 'HUMAN_REVIEW'].includes(first.aiDefinition?.evidenceSource ?? 'PAGE'),
          subchecks: first.aiDefinition?.subchecks ?? [],
          structuringConfidence: first.aiDefinition?.confidence ?? null,
        },
      } as Prisma.InputJsonValue,
    };
  });

  return {
    rowsFound: document.rows.length,
    uniqueCriteria: candidates.length,
    duplicateRows: preparedDocument.duplicates + sourceRows.length - candidates.length,
    skippedRows: preparedDocument.skipped,
    sheetsProcessed,
    candidates,
  };
}

/** Backwards-compatible helper used by existing tests and integrations. */
export async function extractWorkbookCandidates(buffer: Buffer): Promise<WorkbookExtraction> {
  return extractDocumentCandidates({ fileName: 'best-practices.xlsx', buffer });
}

export async function importBestPracticeWorkbook(input: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
  libraryName?: string;
}) {
  const slug = (input.libraryName || 'VariantRank Best Practices')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const checksum = createHash('sha256').update(input.buffer).digest('hex');

  const library = await prisma.bestPracticeLibrary.upsert({
    where: { slug },
    update: {},
    create: {
      name: input.libraryName || 'VariantRank Best Practices',
      slug,
      description: 'Best-practice library staged through the VariantRank Data workflow.',
    },
  });

  const job = await prisma.importJob.create({
    data: {
      libraryId: library.id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      checksum,
      status: ImportJobStatus.PARSING,
    },
  });

  try {
    const extraction = await extractDocumentCandidates(input);
    await prisma.$transaction([
      prisma.importCandidate.createMany({
        data: extraction.candidates.map((candidate) => ({
          importJobId: job.id,
          sourceSheet: candidate.sourceSheet,
          sourceRow: candidate.sourceRow,
          rawData: candidate.rawData,
          proposedCriterion: candidate.proposedCriterion,
          suggestedCanonicalKey: candidate.canonicalKey,
          extractionConfidence: candidate.extractionConfidence,
        })),
      }),
      prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: ImportJobStatus.NEEDS_REVIEW,
          sourceMetadata: {
            rowsFound: extraction.rowsFound,
            uniqueCriteria: extraction.uniqueCriteria,
            duplicateRows: extraction.duplicateRows,
            skippedRows: extraction.skippedRows,
            sheetsProcessed: extraction.sheetsProcessed,
          },
        },
      }),
    ]);

    return {
      id: job.id,
      status: ImportJobStatus.NEEDS_REVIEW,
      library: { id: library.id, name: library.name, slug: library.slug },
      fileName: input.fileName,
      summary: {
        rowsFound: extraction.rowsFound,
        proposedCriteria: extraction.uniqueCriteria,
        duplicateRowsMerged: extraction.duplicateRows,
        skippedRows: extraction.skippedRows,
        sheetsProcessed: extraction.sheetsProcessed,
      },
    };
  } catch (error) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: ImportJobStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Workbook parsing failed',
      },
    });
    throw error;
  }
}

export async function listImportJobs() {
  return prisma.importJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      library: { select: { name: true, slug: true } },
      publishedVersion: { select: { id: true, version: true, status: true, isActive: true, publishedAt: true } },
      _count: { select: { candidates: true } },
    },
  });
}

type ProposedCriterion = {
  canonicalKey?: string;
  title?: string;
  description?: string;
  rationale?: string | null;
  guidance?: string | null;
  pageAreas?: string[];
  outcomeMappings?: string[];
  exampleUrls?: string[];
  implementation?: Record<string, boolean>;
  sourceReferences?: Array<Record<string, unknown>>;
  primaryCategory?: ScoreCategoryKey;
  evaluationMethod?: CriterionEvaluationMethod;
  applicability?: Record<string, unknown>;
  evidenceRequirements?: Record<string, unknown>;
  statusDefinitions?: {
    good?: string;
    canBeImproved?: string;
    bad?: string;
    notApplicable?: string;
  };
};

function asProposedCriterion(value: Prisma.JsonValue): ProposedCriterion {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ProposedCriterion
    : {};
}

function suggestCategory(proposed: ProposedCriterion): ScoreCategoryKey {
  const text = `${proposed.title ?? ''} ${proposed.description ?? ''} ${(proposed.pageAreas ?? []).join(' ')}`.toLowerCase();
  const outcomes = proposed.outcomeMappings ?? [];
  if (outcomes.includes('WEB_ACCESSIBILITY') || /accessib|screen reader|keyboard|focus indicator|alt text/.test(text)) {
    return ScoreCategoryKey.TECHNICAL_ACCESSIBILITY;
  }
  if (/review|trust|guarantee|return|delivery|contact|payment|credib|reassur|security|privacy/.test(text)) {
    return ScoreCategoryKey.TRUST_CONFIDENCE;
  }
  if (/offer|discount|saving|sale price|free shipping|bundle|upsell|cross sell|value proposition|scarcity/.test(text)) {
    return ScoreCategoryKey.OFFER_CLARITY;
  }
  if (/checkout|cart|form|field|error|purchase|add to cart|quantity|variant|step|required/.test(text)) {
    return ScoreCategoryKey.PURCHASE_EASE;
  }
  return ScoreCategoryKey.SHOPPING_UX;
}

function suggestMethod(proposed: ProposedCriterion): CriterionEvaluationMethod {
  const text = `${proposed.description ?? ''} ${(proposed.pageAreas ?? []).join(' ')}`.toLowerCase();
  if (/commercial judgement|brand goals|most logical|relevant to the product|merchandis/.test(text)) {
    return CriterionEvaluationMethod.MANUAL;
  }
  if (/alt text|heading|label|keyboard|focus|field|required|link|load quickly|seconds|pixel|px|meta/.test(text)) {
    return CriterionEvaluationMethod.AUTOMATED;
  }
  if (/clear|prominent|consistent|overcrowded|easy|logical|relevant|visual|imagery|brand/.test(text)) {
    return CriterionEvaluationMethod.AI_ASSISTED;
  }
  return CriterionEvaluationMethod.HYBRID;
}

function withReviewSuggestions(value: Prisma.JsonValue): ProposedCriterion {
  const proposed = asProposedCriterion(value);
  const method = proposed.evaluationMethod ?? suggestMethod(proposed);
  const pageAreas = proposed.pageAreas ?? [];
  return {
    ...proposed,
    primaryCategory: proposed.primaryCategory ?? suggestCategory(proposed),
    evaluationMethod: method,
    applicability: proposed.applicability ?? {
      pageAreas,
      scope: pageAreas.length > 0 ? 'PAGE_SCOPED' : 'SITE_OR_PAGE',
    },
    evidenceRequirements: proposed.evidenceRequirements ?? {
      source: 'IMPORTED_BEST_PRACTICE',
      evidenceType: method === CriterionEvaluationMethod.AUTOMATED ? 'DOM_OR_RENDERED_SIGNAL' : 'RENDERED_PAGE_CONTEXT',
      requiresRenderedPage: true,
    },
  };
}

export async function getImportForReview(importId: string, filters: {
  search?: string;
  status?: ImportCandidateStatus;
  outcome?: string;
  pageArea?: string;
  page?: number;
  pageSize?: number;
}) {
  const job = await prisma.importJob.findUnique({
    where: { id: importId },
    include: { library: { select: { name: true, slug: true } } },
  });
  if (!job) return null;

  const allCandidates = await prisma.importCandidate.findMany({
    where: { importJobId: importId },
    orderBy: [{ sourceSheet: 'asc' }, { sourceRow: 'asc' }],
  });
  const enriched = allCandidates.map((candidate) => ({
    ...candidate,
    proposedCriterion: withReviewSuggestions(candidate.proposedCriterion),
  }));
  const search = filters.search?.trim().toLowerCase();
  const filtered = enriched.filter((candidate) => {
    const proposed = candidate.proposedCriterion;
    if (filters.status && candidate.status !== filters.status) return false;
    if (filters.outcome && !proposed.outcomeMappings?.includes(filters.outcome)) return false;
    if (filters.pageArea && !proposed.pageAreas?.includes(filters.pageArea)) return false;
    if (search && !`${proposed.title ?? ''} ${proposed.description ?? ''}`.toLowerCase().includes(search)) return false;
    return true;
  });
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const page = Math.max(1, filters.page ?? 1);
  const start = (page - 1) * pageSize;

  const statuses = Object.values(ImportCandidateStatus).reduce<Record<string, number>>((counts, status) => {
    counts[status] = allCandidates.filter((candidate) => candidate.status === status).length;
    return counts;
  }, {});
  const outcomes = [...new Set(enriched.flatMap((candidate) => candidate.proposedCriterion.outcomeMappings ?? []))].sort();
  const pageAreas = [...new Set(enriched.flatMap((candidate) => candidate.proposedCriterion.pageAreas ?? []))].sort();

  return {
    import: job,
    summary: { total: allCandidates.length, statuses },
    filters: { outcomes, pageAreas },
    pagination: { page, pageSize, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / pageSize)) },
    candidates: filtered.slice(start, start + pageSize),
  };
}

export async function updateImportCandidate(input: {
  importId: string;
  candidateId: string;
  status?: ImportCandidateStatus;
  primaryCategory?: ScoreCategoryKey;
  evaluationMethod?: CriterionEvaluationMethod;
}) {
  const candidate = await prisma.importCandidate.findFirst({
    where: { id: input.candidateId, importJobId: input.importId, importJob: { status: ImportJobStatus.NEEDS_REVIEW } },
  });
  if (!candidate) return null;
  const proposed = withReviewSuggestions(candidate.proposedCriterion);
  if (input.primaryCategory) proposed.primaryCategory = input.primaryCategory;
  if (input.evaluationMethod) proposed.evaluationMethod = input.evaluationMethod;
  return prisma.importCandidate.update({
    where: { id: candidate.id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      proposedCriterion: proposed as Prisma.InputJsonValue,
    },
  });
}

export async function bulkUpdateImportCandidates(input: {
  importId: string;
  candidateIds?: string[];
  status: ImportCandidateStatus;
  allProposed?: boolean;
}) {
  const job = await prisma.importJob.findFirst({
    where: { id: input.importId, status: ImportJobStatus.NEEDS_REVIEW },
  });
  if (!job) return null;
  return prisma.importCandidate.updateMany({
    where: {
      importJobId: input.importId,
      ...(input.allProposed
        ? { status: ImportCandidateStatus.PROPOSED }
        : { id: { in: input.candidateIds ?? [] } }),
    },
    data: { status: input.status },
  });
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Approved criterion is missing ${field}`);
  return value.trim();
}

export async function publishImport(importId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.importJob.findUnique({ where: { id: importId } });
    if (!job) return null;
    if (job.status !== ImportJobStatus.NEEDS_REVIEW) {
      throw new Error('Only imports awaiting review can be published');
    }
    const candidates = await tx.importCandidate.findMany({ where: { importJobId: importId } });
    const proposedCount = candidates.filter((candidate) => candidate.status === ImportCandidateStatus.PROPOSED).length;
    if (proposedCount > 0) throw new Error(`${proposedCount} checks still need a review decision`);
    const approved = candidates.filter((candidate) => candidate.status === ImportCandidateStatus.APPROVED);
    if (approved.length === 0) throw new Error('Approve at least one check before publishing');

    const latest = await tx.libraryVersion.findFirst({
      where: { libraryId: job.libraryId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = await tx.libraryVersion.create({
      data: {
        libraryId: job.libraryId,
        version: (latest?.version ?? 0) + 1,
        status: LibraryVersionStatus.PUBLISHED,
        isActive: true,
        notes: `Published from import ${job.fileName}`,
        publishedAt: new Date(),
        criteria: {
          create: approved.map((candidate) => {
            const proposed = withReviewSuggestions(candidate.proposedCriterion);
            const outcomes = (proposed.outcomeMappings ?? []).filter((outcome): outcome is BusinessOutcomeKey =>
              Object.values(BusinessOutcomeKey).includes(outcome as BusinessOutcomeKey));
            const implementation = proposed.implementation ?? {};
            return {
              canonicalKey: requiredString(proposed.canonicalKey ?? candidate.suggestedCanonicalKey, 'canonical key'),
              title: requiredString(proposed.title, 'title'),
              description: requiredString(proposed.description, 'description'),
              rationale: proposed.rationale ?? null,
              guidance: proposed.guidance ?? null,
              pageAreas: proposed.pageAreas ?? [],
              applicability: (proposed.applicability ?? {}) as Prisma.InputJsonValue,
              evidenceRequirements: {
                ...(proposed.evidenceRequirements ?? {}),
                ...(proposed.statusDefinitions ? { statusDefinitions: proposed.statusDefinitions } : {}),
              } as Prisma.InputJsonValue,
              defaultMethod: proposed.evaluationMethod ?? CriterionEvaluationMethod.HYBRID,
              importanceWeight: 1,
              includedInCakeTheme: implementation.includedInCakeTheme ?? null,
              customWorkRequired: implementation.customWorkRequired ?? null,
              integrationRequired: implementation.integrationRequired ?? null,
              clientResponsibility: implementation.clientResponsibility ?? null,
              exampleUrl: proposed.exampleUrls?.[0] ?? null,
              sourceReferences: (proposed.sourceReferences ?? []) as Prisma.InputJsonValue,
              categoryMappings: {
                create: [{ category: proposed.primaryCategory ?? ScoreCategoryKey.SHOPPING_UX, weight: 1, isPrimary: true }],
              },
              outcomeMappings: { create: outcomes.map((outcome) => ({ outcome, weight: 1 })) },
            };
          }),
        },
        profiles: {
          create: {
            name: 'Default ecommerce',
            description: 'Initial transparent scoring profile for the published best-practice library.',
            isDefault: true,
            qualityPartialCredit: 0.5,
            categoryWeights: {
              create: [
                { category: ScoreCategoryKey.SHOPPING_UX, weight: 20 },
                { category: ScoreCategoryKey.TRUST_CONFIDENCE, weight: 20 },
                { category: ScoreCategoryKey.OFFER_CLARITY, weight: 20 },
                { category: ScoreCategoryKey.PURCHASE_EASE, weight: 25 },
                { category: ScoreCategoryKey.TECHNICAL_ACCESSIBILITY, weight: 15 },
              ],
            },
          },
        },
      },
      include: { _count: { select: { criteria: true } } },
    });
    await tx.libraryVersion.updateMany({
      where: { id: { not: version.id }, isActive: true },
      data: { isActive: false },
    });
    await tx.importJob.update({
      where: { id: importId },
      data: { status: ImportJobStatus.PUBLISHED, publishedVersionId: version.id },
    });
    return version;
  });
}

export async function deactivatePublishedImport(importId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.importJob.findUnique({
      where: { id: importId },
      include: { publishedVersion: true },
    });
    if (!job?.publishedVersion) return null;
    if (!job.publishedVersion.isActive) return job.publishedVersion;
    return tx.libraryVersion.update({
      where: { id: job.publishedVersion.id },
      data: { isActive: false },
    });
  });
}

export async function activatePublishedImport(importId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.importJob.findUnique({
      where: { id: importId },
      include: { publishedVersion: true },
    });
    if (!job?.publishedVersion) return null;
    await tx.libraryVersion.updateMany({
      where: { isActive: true, id: { not: job.publishedVersion.id } },
      data: { isActive: false },
    });
    return tx.libraryVersion.update({
      where: { id: job.publishedVersion.id },
      data: { isActive: true },
    });
  });
}

export async function createImportRevision(importId: string) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.importJob.findUnique({
      where: { id: importId },
      include: {
        publishedVersion: {
          include: {
            criteria: {
              include: { categoryMappings: true, outcomeMappings: true },
            },
          },
        },
      },
    });
    if (!source?.publishedVersion) return null;
    const revision = await tx.importJob.create({
      data: {
        libraryId: source.libraryId,
        fileName: `${source.fileName} · revision of v${source.publishedVersion.version}`,
        mimeType: source.mimeType,
        status: ImportJobStatus.NEEDS_REVIEW,
        sourceMetadata: {
          revisionOfVersionId: source.publishedVersion.id,
          revisionOfVersion: source.publishedVersion.version,
          rowsFound: source.publishedVersion.criteria.length,
          uniqueCriteria: source.publishedVersion.criteria.length,
          duplicateRows: 0,
          skippedRows: 0,
        },
      },
    });
    await tx.importCandidate.createMany({
      data: source.publishedVersion.criteria.map((criterion) => {
        const primaryCategory = criterion.categoryMappings.find((mapping) => mapping.isPrimary)?.category
          ?? criterion.categoryMappings[0]?.category
          ?? ScoreCategoryKey.SHOPPING_UX;
        const proposedCriterion: ProposedCriterion = {
          canonicalKey: criterion.canonicalKey,
          title: criterion.title,
          description: criterion.description,
          rationale: criterion.rationale,
          guidance: criterion.guidance,
          pageAreas: criterion.pageAreas,
          outcomeMappings: criterion.outcomeMappings.map((mapping) => mapping.outcome),
          exampleUrls: criterion.exampleUrl ? [criterion.exampleUrl] : [],
          implementation: {
            includedInCakeTheme: criterion.includedInCakeTheme ?? false,
            customWorkRequired: criterion.customWorkRequired ?? false,
            integrationRequired: criterion.integrationRequired ?? false,
            clientResponsibility: criterion.clientResponsibility ?? false,
          },
          sourceReferences: Array.isArray(criterion.sourceReferences)
            ? criterion.sourceReferences as Array<Record<string, unknown>>
            : [],
          applicability: criterion.applicability && typeof criterion.applicability === 'object' && !Array.isArray(criterion.applicability)
            ? criterion.applicability as Record<string, unknown>
            : undefined,
          evidenceRequirements: criterion.evidenceRequirements && typeof criterion.evidenceRequirements === 'object' && !Array.isArray(criterion.evidenceRequirements)
            ? criterion.evidenceRequirements as Record<string, unknown>
            : undefined,
          primaryCategory,
          evaluationMethod: criterion.defaultMethod,
        };
        return {
          importJobId: revision.id,
          status: ImportCandidateStatus.PROPOSED,
          rawData: { revisionOfCriterionId: criterion.id } as Prisma.InputJsonValue,
          proposedCriterion: proposedCriterion as Prisma.InputJsonValue,
          suggestedCanonicalKey: criterion.canonicalKey,
          extractionConfidence: 1,
        };
      }),
    });
    return { id: revision.id, status: revision.status, candidateCount: source.publishedVersion.criteria.length };
  });
}

export async function deleteUnpublishedImport(importId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.importJob.findUnique({
      where: { id: importId },
      include: { publishedVersion: { include: { criteria: { select: { id: true } } } } },
    });
    if (!job) return null;
    if (job.publishedVersion) {
      const criterionIds = job.publishedVersion.criteria.map((criterion) => criterion.id);
      const referencedResults = criterionIds.length === 0
        ? 0
        : await tx.criterionEvaluationResult.count({ where: { criterionId: { in: criterionIds } } });
      if (referencedResults > 0) {
        throw new Error(`This version is used by ${referencedResults} saved check result${referencedResults === 1 ? '' : 's'}; deactivate it instead`);
      }
      await tx.libraryVersion.delete({ where: { id: job.publishedVersion.id } });
    }
    await tx.importJob.delete({ where: { id: importId } });
    return { deleted: true };
  });
}
