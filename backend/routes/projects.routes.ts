import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import hasRole from '../middlewares/hasRole.middleware';

const router = Router();

import {
	createProject,
	createProjectMember,
	deleteProject,
	getProjectDetails,
	getProjectMembers,
	getProjects
} from "../controllers/projects.controller";

// Get all projects (only user's projects)
router.get('/', authMiddleware, getProjects);

router.post('/', authMiddleware, createProject);

router.post('/:projectId/members', authMiddleware, hasRole(["owner"]), createProjectMember);

router.get('/:projectId/members', authMiddleware, hasRole(["viewer", "editor", "owner"]), getProjectMembers);

router.get('/:projectId', authMiddleware, hasRole(["viewer", "editor", "owner"]), getProjectDetails);

router.delete('/:projectId', authMiddleware, hasRole(["owner"]), deleteProject);

export default router;
