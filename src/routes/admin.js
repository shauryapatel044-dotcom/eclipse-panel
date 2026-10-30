import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAdmin);

router.get('/system', AdminController.getSystemInfo);
router.get('/users', AdminController.getUsers);
router.put('/users/:id', AdminController.updateUser);
router.put('/users/:id/role', AdminController.updateUserRole);
router.delete('/users/:id', AdminController.deleteUser);

export default router;
