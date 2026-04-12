import { NextFunction, Request, Response } from 'express';
import * as projectService from '../services/projects.service';
import { ProjectRole } from '../types';

export const getProjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const result = await projectService.getAllProjects(req.user.id);
		res.status(200).json({ success: true, data: result });
	} catch (err) {
		next(err);
	}
};

export const createProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

export const getProjectDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const project_id = Number(req.params.projectId);
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

export const deleteProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const project_id = Number(req.params.projectId);

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

export const updateProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const { title } = req.body;
	if (!title) {
		next({ status: 400, message: "No updation data was sent" });
		return;
	}

	const project_id = Number(req.params.projectId);
	if (isNaN(project_id)) {
		next({ status: 400, message: "Invalid project ID" });
		return;
	}
	try {
		const data = await projectService.updateProject(project_id, title);
		if (!data) {
			return next({ status: 404, message: "Project not found" });
		}

		res.status(200).json({
			success: true,
			message: "Project name updated successfully",
			data: data
		});
	} catch (err) {
		next(err);
	}

}

// MEMBERS

export const createProjectMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const project_id = Number(req.params.projectId);
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
		const newProjectMember = await projectService.createProjectMember({
			project_id,
			user_id: userId,
			role: role as ProjectRole
		});

		res.status(200).json({
			success: true,
			data: newProjectMember
		})
		return;

	} catch (err) {
		next(err);
	}
}

export const getProjectMembers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const project_id = Number(req.params.projectId);
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

export const removeMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const project_id = Number(req.params.projectId);
	if (isNaN(project_id)) {
		return next({ status: 400, message: "Valid project ID is required" });
	}

	const user_id = Number(req.params.userId);
	if (isNaN(user_id)) {
		return next({ status: 400, message: "Valid user ID is required" });
	}

	try {
		const removedMember = await projectService.removeMember(project_id, user_id);

		if (!removedMember) {
			return next({ status: 404, message: "User not found" });
		}

		res.status(200).json({ success: true, data: removedMember });

	} catch (err) {
		next(err);
	}
}

export const updateMemberRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const { role } = req.body;
	const allowedRoles = ["editor", "viewer"];
	if (!allowedRoles.includes(role)) {
		return next({ status: 400, message: "Role must be editor or viewer" });
	}

	const project_id = Number(req.params.projectId);
	if (isNaN(project_id)) {
		return next({ status: 400, message: "Valid project ID is required" });
	}

	const user_id = Number(req.params.userId);
	if (isNaN(user_id)) {
		return next({ status: 400, message: "Valid user ID is required" });
	}

	try {
		const updatedMember = await projectService.updateMemberRole(project_id, user_id, role as ProjectRole);

		if (!updatedMember) {
			return next({ status: 404, message: "User not found" });
		}

		res.status(200).json({ success: true, data: updatedMember });

	} catch (err) {
		next(err);
	}
}
