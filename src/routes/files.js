import { Router } from 'express';
import { FileController } from '../controllers/fileController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/:id/list', FileController.listFiles);
router.get('/:id/content', FileController.getFileContent);
router.post('/:id/content', FileController.saveFileContent);
router.post('/:id/upload', FileController.uploadFile);
router.post('/:id/create', FileController.createFile);
router.post('/:id/mkdir', FileController.createFolder);
router.post('/:id/rename', FileController.renameFile);
router.delete('/:id/delete', FileController.deleteFile);

export default router;
