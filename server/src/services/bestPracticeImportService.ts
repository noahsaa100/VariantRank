import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
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

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if ('text' in value && typeof value.text === 'string') return value.text.trim();
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join('').trim();
  }
  if ('result' in value && value.result !== undefined) return String(value.result).trim();
  return String(cell.text ?? '').trim();
}

function optionalText(cell: ExcelJS.Cell): string | null {
  return cellText(cell) || null;
}

function flagValue(cell: ExcelJS.Cell): boolean | null {
  const value = cellText(cell).toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(value)) return true;
  if (['0', 'false', 'no', 'n'].includes(value)) return false;
  return null;
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

function worksheetImageRows(worksheet: ExcelJS.Worksheet): Set<number> {
  const rows = new Set<number>();
  for (const image of worksheet.getImages()) {
    const range = image.range as unknown as { tl?: { nativeRow?: number }; editAs?: string };
    const zeroBasedRow = range.tl?.nativeRow;
    if (typeof zeroBasedRow === 'number') rows.add(zeroBasedRow + 1);
  }
  return rows;
}

function readStandardSheet(worksheet: ExcelJS.Worksheet, outcome: string): SourceRow[] {
  const imageRows = worksheetImageRows(worksheet);
  const rows: SourceRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const description = cellText(row.getCell(4));
    if (!description) return;
    rows.push({
      sheet: worksheet.name,
      row: rowNumber,
      outcome,
      metric: cellText(row.getCell(2)) || worksheet.name,
      pageArea: cellText(row.getCell(3)) || 'Unspecified',
      description,
      rationale: optionalText(row.getCell(5)),
      notes: optionalText(row.getCell(6)),
      exampleUrl: optionalText(row.getCell(8)),
      hasScreenshot: imageRows.has(rowNumber) || Boolean(cellText(row.getCell(7))),
      includedInCakeTheme: flagValue(row.getCell(9)),
      customWorkRequired: flagValue(row.getCell(10)),
      integrationRequired: flagValue(row.getCell(11)),
      clientResponsibility: flagValue(row.getCell(12)),
    });
  });
  return rows;
}

function readThankYouSheet(worksheet: ExcelJS.Worksheet): SourceRow[] {
  const rows: SourceRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const description = cellText(row.getCell(2));
    if (!description || ['General', "Conversion and AOV 'boosters'"].includes(description)) return;
    rows.push({
      sheet: worksheet.name,
      row: rowNumber,
      outcome: 'THANK_YOU_PAGE',
      metric: 'Thank you page',
      pageArea: 'Thank you page',
      description,
      rationale: null,
      notes: optionalText(row.getCell(5)),
      exampleUrl: null,
      hasScreenshot: false,
      includedInCakeTheme: flagValue(row.getCell(4)),
      customWorkRequired: null,
      integrationRequired: null,
      clientResponsibility: null,
    });
  });
  return rows;
}

export async function extractWorkbookCandidates(buffer: Buffer): Promise<WorkbookExtraction> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sourceRows: SourceRow[] = [];
  const sheetsProcessed: string[] = [];
  for (const [sheetName, outcome] of Object.entries(STANDARD_SHEETS)) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) continue;
    sheetsProcessed.push(sheetName);
    sourceRows.push(...readStandardSheet(worksheet, outcome));
  }

  const thankYouSheet = workbook.worksheets.find((sheet) => sheet.name.includes('Thank you page'));
  if (thankYouSheet) {
    sheetsProcessed.push(thankYouSheet.name);
    sourceRows.push(...readThankYouSheet(thankYouSheet));
  }

  if (sourceRows.length === 0) {
    throw new Error('No supported best-practice rows were found in the workbook');
  }

  const grouped = new Map<string, SourceRow[]>();
  for (const row of sourceRows) {
    const normalized = normalizeCriterion(row.description);
    if (!normalized) continue;
    grouped.set(normalized, [...(grouped.get(normalized) ?? []), row]);
  }

  const candidates = [...grouped.values()].map((sources): ExtractedImportCandidate => {
    const first = sources[0];
    const outcomes = [...new Set(sources.map((source) => source.outcome))];
    const pageAreas = [...new Set(sources.map((source) => source.pageArea))];
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
        title: titleFromDescription(first.description),
        description: first.description,
        rationale: rationales.join('\n\n') || null,
        guidance: notes.join('\n\n') || null,
        pageAreas,
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
      } as Prisma.InputJsonValue,
    };
  });

  return {
    rowsFound: sourceRows.length,
    uniqueCriteria: candidates.length,
    duplicateRows: sourceRows.length - candidates.length,
    skippedRows: 0,
    sheetsProcessed,
    candidates,
  };
}

export async function importBestPracticeWorkbook(input: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
  libraryName?: string;
}) {
  const slug = (input.libraryName || 'Cake Ecommerce Scorecard')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const checksum = createHash('sha256').update(input.buffer).digest('hex');

  const library = await prisma.bestPracticeLibrary.upsert({
    where: { slug },
    update: {},
    create: {
      name: input.libraryName || 'Cake Ecommerce Scorecard',
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
    const extraction = await extractWorkbookCandidates(input.buffer);
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
  return {
    ...proposed,
    primaryCategory: proposed.primaryCategory ?? suggestCategory(proposed),
    evaluationMethod: proposed.evaluationMethod ?? suggestMethod(proposed),
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
      where: { libraryId: job.libraryId, id: { not: version.id }, isActive: true },
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
      where: { libraryId: job.libraryId, isActive: true, id: { not: job.publishedVersion.id } },
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
