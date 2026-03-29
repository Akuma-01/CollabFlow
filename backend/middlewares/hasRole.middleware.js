const { getProjectMember, getProjectById } = require("../services/projects.service")

const hasRole = (allowedRoles) => {
	return async (req, res, next) => {
		try {
			const user_id = Number(req.user.id);
			const project_id = Number(req.params.projectId || req.params.id);
			const project = await getProjectById(project_id);
			if (!project) {
				return next({ status: 404, message: "Project not found" })
			}

			if (project.owner_id === user_id) {
				return next();
			}

			const member = await getProjectMember(project_id, user_id);
			if (!member) {
				return next({ status: 403, message: "Not a project member" })
			}

			if (allowedRoles.includes(member.role)) {
				return next();
			}

			return next({ status: 403, message: "Insufficient role" })
		} catch (err) {
			next(err);
		}
	}
}

module.exports = hasRole

