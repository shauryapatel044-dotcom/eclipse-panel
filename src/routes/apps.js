import { Router } from 'express';
import { AppController } from '../controllers/appController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', AppController.getApps);
router.post('/', AppController.createApp);
router.get('/:id', AppController.getAppById);
router.put('/:id', AppController.updateApp);
router.delete('/:id', AppController.deleteApp);

// Action endpoints: start, stop, restart, install, command
router.post('/:id/action/:action', AppController.performAction);
router.post('/:id/command', AppController.sendCommand);
router.get('/:id/startup', AppController.getStartup);
router.put('/:id/startup', AppController.updateStartup);
router.get('/:id/logs', AppController.getLogs);
router.get('/:id/stats', AppController.getStats);

export default router;
