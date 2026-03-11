import { Router } from 'express';
import * as evaluationController from '../controllers/evaluationController';

const router = Router();

router.post('/evaluate', evaluationController.createEvaluation);
router.get('/evaluations', evaluationController.listEvaluations);
router.delete('/evaluations', evaluationController.deleteAllEvaluations);
router.get('/evaluations/:id', evaluationController.getEvaluation);
router.delete('/evaluations/:id', evaluationController.deleteEvaluation);

export default router;
