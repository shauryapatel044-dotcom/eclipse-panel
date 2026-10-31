import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAdmin);

router.get('/system', AdminController.getSystemInfo);
router.get('/users', AdminController.getUsers);
router.post('/users', AdminController.createUser);
router.put('/users/:id', AdminController.updateUser);
router.put('/users/:id/role', AdminController.updateUserRole);
router.delete('/users/:id', AdminController.deleteUser);

// Audit Logs
router.get('/audit-logs', AdminController.getAuditLogs);

// SSL Management
router.get('/ssl/status', AdminController.getSSLStatus);
router.post('/ssl/issue', AdminController.issueSSL);

// Discord Bot Management
router.get('/discord-bot', AdminController.getDiscordBot);
router.put('/discord-bot', AdminController.updateDiscordBot);
router.post('/discord-bot/restart', AdminController.restartDiscordBot);

// Incident Alerts (Discord / Telegram)
router.get('/alerts', AdminController.getAlertSettings);
router.put('/alerts', AdminController.updateAlertSettings);
router.post('/alerts/test', AdminController.testAlert);

// Port pool
router.get('/next-port', AdminController.getNextAvailablePort);

// Designer theme settings
router.get('/theme', AdminController.getTheme);
router.post('/theme', AdminController.updateTheme);

export default router;
