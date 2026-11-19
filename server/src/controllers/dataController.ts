import { Request, Response } from 'express';
import { CriterionEvaluationMethod, ImportCandidateStatus, ScoreCategoryKey } from '@prisma/client';
import {
  bulkUpdateImportCandidates,
  createImportRevision,
  activatePublishedImport,
  deactivatePublishedImport,
  deleteUnpublishedImport,
  getImportForReview,
  importBestPracticeWorkbook,
  listImportJobs,
  publishImport,
  updateImportCandidate,
} from '../services/bestPracticeImportService';

export async function uploadBestPractices(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: 'An XLSX workbook is required in the file field' });
    return;
  }

  try {
    const result = await importBestPracticeWorkbook({
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      libraryName: typeof req.body.libraryName === 'string' ? req.body.libraryName.trim() : undefined,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('uploadBestPractices error:', error);
    res.status(422).json({
      error: error instanceof Error ? error.message : 'Could not parse workbook',
    });
  }
}

export async function getImportJobs(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listImportJobs());
  } catch (error) {
    console.error('getImportJobs error:', error);
    res.status(500).json({ error: 'Could not load imports' });
  }
}

export async function getImportReview(req: Request, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' && Object.values(ImportCandidateStatus).includes(req.query.status as ImportCandidateStatus)
      ? req.query.status as ImportCandidateStatus
      : undefined;
    const result = await getImportForReview(req.params.id, {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status,
      outcome: typeof req.query.outcome === 'string' ? req.query.outcome : undefined,
      pageArea: typeof req.query.pageArea === 'string' ? req.query.pageArea : undefined,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50,
    });
    if (!result) {
      res.status(404).json({ error: 'Import not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('getImportReview error:', error);
    res.status(500).json({ error: 'Could not load import review' });
  }
}

export async function patchImportCandidate(req: Request, res: Response): Promise<void> {
  const { status, primaryCategory, evaluationMethod } = req.body as Record<string, unknown>;
  if (status !== undefined && !Object.values(ImportCandidateStatus).includes(status as ImportCandidateStatus)) {
    res.status(400).json({ error: 'Invalid candidate status' });
    return;
  }
  if (primaryCategory !== undefined && !Object.values(ScoreCategoryKey).includes(primaryCategory as ScoreCategoryKey)) {
    res.status(400).json({ error: 'Invalid score category' });
    return;
  }
  if (evaluationMethod !== undefined && !Object.values(CriterionEvaluationMethod).includes(evaluationMethod as CriterionEvaluationMethod)) {
    res.status(400).json({ error: 'Invalid evaluation method' });
    return;
  }
  try {
    const result = await updateImportCandidate({
      importId: req.params.id,
      candidateId: req.params.candidateId,
      status: status as ImportCandidateStatus | undefined,
      primaryCategory: primaryCategory as ScoreCategoryKey | undefined,
      evaluationMethod: evaluationMethod as CriterionEvaluationMethod | undefined,
    });
    if (!result) {
      res.status(404).json({ error: 'Editable candidate not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('patchImportCandidate error:', error);
    res.status(500).json({ error: 'Could not update candidate' });
  }
}

export async function bulkPatchImportCandidates(req: Request, res: Response): Promise<void> {
  const { candidateIds, status, allProposed } = req.body as {
    candidateIds?: unknown;
    status?: unknown;
    allProposed?: unknown;
  };
  const hasIds = Array.isArray(candidateIds)
    && candidateIds.length > 0
    && candidateIds.every((id) => typeof id === 'string');
  if (!hasIds && allProposed !== true) {
    res.status(400).json({ error: 'Provide candidateIds or set allProposed to true' });
    return;
  }
  if (!Object.values(ImportCandidateStatus).includes(status as ImportCandidateStatus)) {
    res.status(400).json({ error: 'Invalid candidate status' });
    return;
  }
  try {
    const result = await bulkUpdateImportCandidates({
      importId: req.params.id,
      candidateIds: hasIds ? candidateIds as string[] : undefined,
      status: status as ImportCandidateStatus,
      allProposed: allProposed === true,
    });
    if (!result) {
      res.status(404).json({ error: 'Editable import not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('bulkPatchImportCandidates error:', error);
    res.status(500).json({ error: 'Could not update candidates' });
  }
}

export async function publishImportVersion(req: Request, res: Response): Promise<void> {
  try {
    const version = await publishImport(req.params.id);
    if (!version) {
      res.status(404).json({ error: 'Import not found' });
      return;
    }
    res.status(201).json(version);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not publish import';
    res.status(409).json({ error: message });
  }
}

export async function deactivateImportVersion(req: Request, res: Response): Promise<void> {
  try {
    const version = await deactivatePublishedImport(req.params.id);
    if (!version) {
      res.status(404).json({ error: 'Published version not found' });
      return;
    }
    res.json(version);
  } catch (error) {
    console.error('deactivateImportVersion error:', error);
    res.status(500).json({ error: 'Could not deactivate library' });
  }
}

export async function activateImportVersion(req: Request, res: Response): Promise<void> {
  try {
    const version = await activatePublishedImport(req.params.id);
    if (!version) {
      res.status(404).json({ error: 'Published version not found' });
      return;
    }
    res.json(version);
  } catch (error) {
    console.error('activateImportVersion error:', error);
    res.status(500).json({ error: 'Could not activate library' });
  }
}

export async function reviseImportVersion(req: Request, res: Response): Promise<void> {
  try {
    const revision = await createImportRevision(req.params.id);
    if (!revision) {
      res.status(404).json({ error: 'Published version not found' });
      return;
    }
    res.status(201).json(revision);
  } catch (error) {
    console.error('reviseImportVersion error:', error);
    res.status(500).json({ error: 'Could not create revision' });
  }
}

export async function deleteImport(req: Request, res: Response): Promise<void> {
  try {
    const result = await deleteUnpublishedImport(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Import not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete import';
    res.status(409).json({ error: message });
  }
}
