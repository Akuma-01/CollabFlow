import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import hasRole from '../middlewares/hasRole.middleware';

const router = Router();

import {
	addGuide,
	createProject,
	createProjectMember,
	deleteProject,
	getProjectDetails,
	getProjectMembers,
	getProjects,
	removeMember,
	updateMemberRole,
	updateProject
} from "../controllers/projects.controller";

// Get all projects (only user's projects)
router.get('/', authMiddleware, getProjects);

router.post('/', authMiddleware, createProject);

router.get('/:projectId', authMiddleware, hasRole(["viewer", "editor", "owner", "guide"]), getProjectDetails);

router.delete('/:projectId', authMiddleware, hasRole(["owner"]), deleteProject);

router.patch('/:projectId', authMiddleware, hasRole(["owner"]), updateProject);


// Members
router.post('/:projectId/members', authMiddleware, hasRole(["owner"]), createProjectMember);

router.get('/:projectId/members', authMiddleware, hasRole(["viewer", "editor", "owner", "guide"]), getProjectMembers);

router.delete('/:projectId/members/:userId', authMiddleware, hasRole(["owner"]), removeMember);

router.patch('/:projectId/members/:userId', authMiddleware, hasRole(["owner"]), updateMemberRole);

//guide
router.post('/:projectId/guides', authMiddleware, hasRole(["owner"]), addGuide);

export default router;
