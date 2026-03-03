import { Router } from 'express';
import * as evaluationController from '../controllers/evaluationController';

const router = Router();

router.post('/evaluate', evaluationController.createEvaluation);
router.get('/evaluations', evaluationController.listEvaluations);
router.get('/evaluations/:id', evaluationController.getEvaluation);

export default router;
