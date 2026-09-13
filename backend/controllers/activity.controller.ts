import { NextFunction, Request, Response } from 'express';
import { activityQuerySchema } from '../schemas/activity.schema';
import * as activityService from '../services/activity.service';
import { AppError } from '../utils/AppError';

export async function getActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const query = activityQuerySchema.safeParse(req.query);
		if (!query.success) throw new AppError('Invalid activity query', 400);
		const page = await activityService.list(Number(req.params.projectId), req.user.id, query.data);
		res.json({ success: true, ...page });
	} catch (error) {
		next(error);
	}
}
