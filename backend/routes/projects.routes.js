const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const hasRole = require("../middlewares/hasRole.middleware");

const {
	createProject,
	getProjects,
	createProjectMember,
	getProjectMembers,
	getProjectDetails,
	deleteProject
} = require("../controllers/projects.controller")

// Get all projects (only user's projects)
router.get('/', authMiddleware, getProjects);

router.post('/', authMiddleware, createProject);

router.post('/:id/members', authMiddleware, hasRole(["owner"]), createProjectMember);

router.get('/:id/members', authMiddleware, hasRole(["viewer", "editor", "owner"]), getProjectMembers);

router.get('/:id', authMiddleware, hasRole(["viewer", "editor", "owner"]), getProjectDetails);

router.delete('/:id', authMiddleware, hasRole(["owner"]), deleteProject);

module.exports = router
