const express = require("express")
const router = express.Router();
const hasRole = require("../middlewares/hasRole.middleware");
const authMiddleware = require("../middlewares/auth.middleware")

const {
	createTask,
	getProjectTasks,
	assignTask,
	updateTaskStatus } = require("../controllers/tasks.controller")

router.get("/:id/tasks", authMiddleware, hasRole(["owner", "viewer", "editor"]), getProjectTasks);

router.post("/:id/tasks", authMiddleware, hasRole(["owner", "editor"]), createTask);

router.patch("/:projectId/tasks/:id/assign", authMiddleware, hasRole(["owner", "editor"]), assignTask);

router.patch("/:projectId/tasks/:id/status", authMiddleware, hasRole(["owner", "editor"]), updateTaskStatus);

module.exports = router
