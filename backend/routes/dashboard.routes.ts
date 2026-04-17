import { Router } from 'express';
import { getDashboard, getMyTasks } from '../controllers/dashboard.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authMiddleware, getDashboard);
router.get('/', authMiddleware, getMyTasks);

export default router;
