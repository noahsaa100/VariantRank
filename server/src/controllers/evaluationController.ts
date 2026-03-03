import { Request, Response } from 'express';
import * as evaluationService from '../services/evaluationService';

export async function createEvaluation(req: Request, res: Response): Promise<void> {
  try {
    const { urls, goal, anonymousSessionId } = req.body as {
      urls?: unknown;
      goal?: unknown;
      anonymousSessionId?: string;
    };

    if (!Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({ error: 'urls must be a non-empty array' });
      return;
    }
    if (typeof goal !== 'string' || goal.trim() === '') {
      res.status(400).json({ error: 'goal must be a non-empty string' });
      return;
    }

    const evaluation = await evaluationService.createEvaluation({
      urls: urls as string[],
      goal: goal.trim(),
      anonymousSessionId,
    });

    res.status(201).json(evaluation);
  } catch (err) {
    console.error('createEvaluation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function listEvaluations(_req: Request, res: Response): Promise<void> {
  try {
    const evaluations = await evaluationService.listEvaluations();
    res.json(evaluations);
  } catch (err) {
    console.error('listEvaluations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getEvaluation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const evaluation = await evaluationService.getEvaluation(id);
    if (!evaluation) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    res.json(evaluation);
  } catch (err) {
    console.error('getEvaluation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
