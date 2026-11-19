import { Router } from 'express';
import multer from 'multer';
import * as dataController from '../controllers/dataController';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const isXlsx = file.originalname.toLowerCase().endsWith('.xlsx')
      || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (!isXlsx) {
      callback(new Error('Only .xlsx workbooks are currently supported'));
      return;
    }
    callback(null, true);
  },
});

router.post('/best-practice-imports', upload.single('file'), dataController.uploadBestPractices);
router.get('/best-practice-imports', dataController.getImportJobs);
router.get('/best-practice-imports/:id', dataController.getImportReview);
router.patch('/best-practice-imports/:id/candidates/:candidateId', dataController.patchImportCandidate);
router.patch('/best-practice-imports/:id/candidates', dataController.bulkPatchImportCandidates);
router.post('/best-practice-imports/:id/publish', dataController.publishImportVersion);
router.post('/best-practice-imports/:id/deactivate', dataController.deactivateImportVersion);
router.post('/best-practice-imports/:id/activate', dataController.activateImportVersion);
router.post('/best-practice-imports/:id/revisions', dataController.reviseImportVersion);
router.delete('/best-practice-imports/:id', dataController.deleteImport);

export default router;
