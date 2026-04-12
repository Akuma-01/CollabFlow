import { Router } from 'express';
import { getUsers } from '../controllers/users.controller';
import authMiddleware from '../middlewares/auth.middleware';
const router = Router();

router.get('/', authMiddleware, getUsers);

export default router;
