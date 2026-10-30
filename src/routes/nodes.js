import { Router } from 'express';
import { NodeController } from '../controllers/nodeController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', NodeController.listNodes);
router.post('/', requireAdmin, NodeController.createNode);
router.put('/:id', requireAdmin, NodeController.updateNode);
router.delete('/:id', requireAdmin, NodeController.deleteNode);
router.post('/:id/test', requireAdmin, NodeController.testNode);

export default router;
