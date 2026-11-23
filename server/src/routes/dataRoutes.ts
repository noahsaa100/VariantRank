import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import * as dataController from '../controllers/dataController';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split('.').pop();
    const supported = ['xlsx', 'csv', 'json', 'txt', 'md', 'markdown', 'pdf', 'docx'].includes(extension ?? '');
    if (!supported) {
      callback(new Error('Use XLSX, CSV, JSON, TXT, Markdown, PDF or DOCX'));
      return;
    }
    callback(null, true);
  },
});

function uploadBestPracticeFile(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File too large. 50 MB maximum upload.' });
      return;
    }
    if (error instanceof Error) {
      res.status(415).json({ error: error.message });
      return;
    }
    next();
  });
}

router.post('/best-practice-imports', uploadBestPracticeFile, dataController.uploadBestPractices);
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
