import { Router } from 'express';
import { searchUsers } from '../controllers/users.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authMiddleware, searchUsers);

export default router;
