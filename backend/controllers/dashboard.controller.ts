import { NextFunction, Request, Response } from "express";
import * as projectService from '../services/projects.service';
import * as tasksService from '../services/tasks.service';

export const getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const data = await projectService.getUserDashboard(req.user.id);
		res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
}

export const getMyTasks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const data = await tasksService.getAssignedTasks(req.user.id);
		res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
};
