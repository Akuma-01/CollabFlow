import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import hasRole from '../middlewares/hasRole.middleware';
import validate from '../middlewares/validate';
import { assignTaskSchema, createTaskSchema, updateTaskSchema, updateTaskStatusSchema } from '../schemas/task.schema';

const router = Router();

import {
	assignTask,
	createTask,
	deleteTask,
	getProjectTasks,
	updateTask,
	updateTaskStatus
} from "../controllers/tasks.controller";

router.get("/:projectId/tasks", authMiddleware, hasRole(["owner", "viewer", "editor", "guide"]), getProjectTasks);

router.post("/:projectId/tasks", authMiddleware, hasRole(["owner", "editor"]), validate(createTaskSchema), createTask);

router.patch("/:projectId/tasks/:id/assign", authMiddleware, hasRole(["owner", "editor"]), validate(assignTaskSchema), assignTask);

router.patch("/:projectId/tasks/:id/status", authMiddleware, hasRole(["owner", "editor"]), validate(updateTaskStatusSchema), updateTaskStatus);

router.patch("/:projectId/tasks/:id", authMiddleware, hasRole(["owner", "editor"]), validate(updateTaskSchema), updateTask);

router.delete("/:projectId/tasks/:id", authMiddleware, hasRole(["owner", "editor"]), deleteTask);

export default router;
