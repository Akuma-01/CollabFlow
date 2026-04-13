import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import hasRole from '../middlewares/hasRole.middleware';

const router = Router();

import {
	assignTask,
	createTask,
	deleteTask,
	getProjectTasks,
	updateTask,
	updateTaskStatus
} from "../controllers/tasks.controller";

router.get("/:projectId/tasks", authMiddleware, hasRole(["owner", "viewer", "editor"]), getProjectTasks);

router.post("/:projectId/tasks", authMiddleware, hasRole(["owner", "editor"]), createTask);

router.patch("/:projectId/tasks/:id/assign", authMiddleware, hasRole(["owner", "editor"]), assignTask);

router.patch("/:projectId/tasks/:id/status", authMiddleware, hasRole(["owner", "editor"]), updateTaskStatus);

router.patch("/:projectId/tasks/:id", authMiddleware, hasRole(["owner", "editor"]), updateTask);

router.delete("/:projectId/tasks/:id", authMiddleware, hasRole(["owner", "editor"]), deleteTask);

export default router;
