import { Router } from 'express';
import { AppController } from '../controllers/appController.js';
import { DatabaseController } from '../controllers/databaseController.js';
import { BackupController } from '../controllers/backupController.js';
import { ScheduleController } from '../controllers/scheduleController.js';
import { CollaboratorController } from '../controllers/collaboratorController.js';
import { WebhookController } from '../controllers/webhookController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Public Git CI/CD webhook route (authenticated via secret token query/header)
router.post('/:id/webhook', WebhookController.handleWebhook);

// Protected routes below
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
router.get('/:id/activity', AppController.getActivity);
router.post('/:id/domain', AppController.setDomain);
router.post('/:id/domain/verify', AppController.verifyDomain);

// Git CI/CD Webhook Token Generation
router.post('/:id/webhook/generate-token', WebhookController.generateToken);

// MariaDB Database Generator
router.get('/:id/databases', DatabaseController.listDatabases);
router.post('/:id/databases', DatabaseController.createDatabase);
router.delete('/:id/databases/:dbId', DatabaseController.deleteDatabase);

// Backup & Snapshot Manager
router.get('/:id/backups', BackupController.listBackups);
router.post('/:id/backups', BackupController.createBackup);
router.get('/:id/backups/:backupId/download', BackupController.downloadBackup);
router.post('/:id/backups/:backupId/restore', BackupController.restoreBackup);
router.delete('/:id/backups/:backupId', BackupController.deleteBackup);

// Visual Cron & Background Schedules
router.get('/:id/schedules', ScheduleController.listSchedules);
router.post('/:id/schedules', ScheduleController.createSchedule);
router.put('/:id/schedules/:scheduleId', ScheduleController.updateSchedule);
router.post('/:id/schedules/:scheduleId/run', ScheduleController.runScheduleNow);
router.delete('/:id/schedules/:scheduleId', ScheduleController.deleteSchedule);

// Sub-Users & Granular RBAC Permissions
router.get('/:id/collaborators', CollaboratorController.listCollaborators);
router.post('/:id/collaborators', CollaboratorController.addCollaborator);
router.delete('/:id/collaborators/:collabId', CollaboratorController.removeCollaborator);

export default router;
