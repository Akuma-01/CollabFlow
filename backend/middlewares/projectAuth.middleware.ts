import { NextFunction, Request, Response } from 'express';
import { getProjectById, isUserMember } from '../services/projects.service';

export const isProjectOwner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const projectId = Number(req.params.id);

		if (isNaN(projectId)) {
			return next({ status: 400, message: "Invalid project Id" });
		}

		const project = await getProjectById(projectId);

		if (!project) {
			return next({ status: 404, message: "Project not found" })
		}

		if (project.owner_id !== req.user.id) {
			return next({ status: 403, message: "Only owner allowed" });
		}

		next();

	} catch (err) {
		next(err);
	}

}

export const isProjectMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const projectId = Number(req.params.id);

		if (isNaN(projectId)) {
			return next({ status: 400, message: "Invalid project Id" });
		}

		const project = await getProjectById(projectId);

		if (!project) {
			return next({ status: 404, message: "Project not found" })
		}

		const isMember = await isUserMember(req.user.id, project.id);

		if (project.owner_id !== req.user.id && !isMember) {
			return next({ status: 403, message: "Only members allowed" })
		}

		next();

	} catch (err) {
		next(err);
	}
}
