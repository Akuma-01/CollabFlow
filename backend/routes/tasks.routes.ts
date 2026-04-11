import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import hasRole from '../middlewares/hasRole.middleware';

const router = Router();

import {
	assignTask,
	createTask,
	getProjectTasks,
	updateTaskStatus
} from "../controllers/tasks.controller";

router.get("/:id/tasks", authMiddleware, hasRole(["owner", "viewer", "editor"]), getProjectTasks);

router.post("/:id/tasks", authMiddleware, hasRole(["owner", "editor"]), createTask);

router.patch("/:projectId/tasks/:id/assign", authMiddleware, hasRole(["owner", "editor"]), assignTask);

router.patch("/:projectId/tasks/:id/status", authMiddleware, hasRole(["owner", "editor"]), updateTaskStatus);

export default router;
