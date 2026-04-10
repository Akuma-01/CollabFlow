const projectService = require("../services/projects.service")

const getProjects = async (req, res, next) => {
	try {
		const result = await projectService.getAllProjects(req.user.id);

		res.status(200).json({
			success: true,
			data: result,
		});
	} catch (err) {
		next(err);
	}
}

const createProject = async (req, res, next) => {
	const { title } = req.body;

	if (!title || typeof title != "string") {
		return next({ status: 400, message: "Valid title is required" });
	}

	const ownerId = req.user.id;

	try {
		const newProject = await projectService.createProject(title, ownerId);

		res.status(201).json({
			success: true,
			data: newProject
		})
	} catch (err) {
		next(err);
	}
};

const createProjectMember = async (req, res, next) => {
	const project_id = Number(req.params.id);
	const { user_id, role } = req.body;

	if (isNaN(project_id)) {
		return next({ status: 400, message: "Valid project ID is required" });
	}

	const userId = Number(user_id);
	if (!user_id || isNaN(userId)) {
		return next({ status: 400, message: "Valid user ID is required" })
	}

	if (!role || typeof (role) !== "string") {
		return next({ status: 400, message: "Valid role is required" });
	}

	const allowedRoles = ["editor", "viewer"];
	if (!allowedRoles.includes(role)) {
		return next({ status: 400, message: "Role must be editor or viewer" });
	}

	try {
		const newProjectMember = await projectService.createProjectMember({ project_id, user_id: userId, role });

		return res.status(200).json({
			success: true,
			data: newProjectMember
		})
	} catch (err) {
		next(err);
	}
}

const getProjectDetails = async (req, res, next) => {
	try {
		const project_id = Number(req.params.id);
		if (isNaN(project_id)) {
			return next({ status: 400, message: "Valid project ID is required" });
		}

		const details = await projectService.getProjectDetails(project_id);

		res.status(200).json({
			success: true,
			data: details
		})
	} catch (err) {
		next(err);
	}
}


const getProjectMembers = async (req, res, next) => {
	const project_id = Number(req.params.id);
	if (isNaN(project_id)) {
		return next({ status: 400, message: "Valid project ID is required" });
	}

	try {
		const result = await projectService.getProjectMembers(project_id);

		res.status(200).json({
			success: true,
			data: result
		})
	} catch (err) {
		next(err);
	}

}

const deleteProject = async (req, res, next) => {
	try {
		const project_id = Number(req.params.id);

		if (isNaN(project_id)) {
			return next({ status: 400, message: "Valid project ID is required" });
		}

		const deletedProject = await projectService.deleteProject(project_id);
		if (!deletedProject) {
			return next({ status: 404, message: "Project not found" });
		}

		res.status(200).json({
			success: true,
			message: "Project deleted successfully",
			data: deletedProject
		})

	} catch (err) {
		return next(err);
	}
}

module.exports = {
	createProject,
	getProjects,
	getProjectDetails,
	createProjectMember,
	getProjectMembers,
	deleteProject
};
