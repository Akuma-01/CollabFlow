import { NextFunction, Request, Response } from 'express';
import { getProjectAccess } from '../services/projects.service';
import { ProjectRole } from '../types';

const hasRole = (allowedRoles: ProjectRole[]) => {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const user_id = Number(req.user.id);
			const project_id = Number(req.params.projectId);
			const access = await getProjectAccess(project_id, user_id);

			if (!access) {
				return next({ status: 404, message: "Project not found" })
			}

			if (access.owner_id === user_id) {
				return next();
			}

			if (!access.role) {
				return next({ status: 403, message: "Not a project member" });
			}

			if (allowedRoles.includes(access.role)) {
				return next();
			}

			return next({ status: 403, message: "Insufficient role" })
		} catch (err) {
			next(err);
		}
	}
}

export default hasRole;
