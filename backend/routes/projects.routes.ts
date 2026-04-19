import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import hasRole from '../middlewares/hasRole.middleware';
import validate from '../middlewares/validate';
import { addGuideSchema, addMemberSchema, updateMemberRoleSchema } from '../schemas/member.schema';
import { createProjectSchema, updateProjectSchema } from '../schemas/project.schema';

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

router.post('/', authMiddleware, validate(createProjectSchema), createProject);

router.get('/:projectId', authMiddleware, hasRole(["viewer", "editor", "owner", "guide"]), getProjectDetails);

router.delete('/:projectId', authMiddleware, hasRole(["owner"]), deleteProject);

router.patch('/:projectId', authMiddleware, hasRole(["owner"]), validate(updateProjectSchema), updateProject);


// Members
router.post('/:projectId/members', authMiddleware, hasRole(["owner"]), validate(addMemberSchema), createProjectMember);

router.get('/:projectId/members', authMiddleware, hasRole(["viewer", "editor", "owner", "guide"]), getProjectMembers);

router.delete('/:projectId/members/:userId', authMiddleware, hasRole(["owner"]), removeMember);

router.patch('/:projectId/members/:userId', authMiddleware, hasRole(["owner"]), validate(updateMemberRoleSchema), updateMemberRole);

//guide
router.post('/:projectId/guides', authMiddleware, hasRole(["owner"]), validate(addGuideSchema), addGuide);

export default router;
