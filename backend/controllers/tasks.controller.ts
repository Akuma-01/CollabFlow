import { NextFunction, Request, Response } from 'express';
import * as tasksService from '../services/tasks.service';
import { TaskStatus } from '../types';


export const createTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const { title, description, deadline } = req.body;

		const project_id = Number(req.params.projectId);
		if (isNaN(project_id)) {
			return next({ status: 400, message: "Valid project ID is required" })
		}

		const result = await tasksService.createTask(title, description, project_id, req.user.id, deadline);

		res.status(201).json({
			success: true,
			data: result
		})

	} catch (err) {
		console.error("CREATE TASK ERROR:", err);
		next(err);
	}
}

export const getProjectTasks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const { assigned_to, status } = req.query;
		const assignedTo = assigned_to ? Number(assigned_to) : null;
		const taskStatus = (status as TaskStatus) || null;

		const project_id = Number(req.params.projectId);
		if (isNaN(project_id)) {
			return next({ status: 400, message: "Valid project ID is required" })
		}

		const result = await tasksService.getProjectTasks(project_id, assignedTo, taskStatus);

		res.status(200).json({
			success: true,
			data: result
		})

	} catch (err) {
		next(err);
	}
}

export const assignTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const task_id = Number(req.params.id);
	if (isNaN(task_id)) {
		return next({ status: 400, message: "Valid task ID is required" });
	}

	const project_id = Number(req.params.projectId);
	if (isNaN(project_id)) {
		return next({ status: 400, message: "Valid project ID is required" });
	}

	const { assigned_to } = req.body;

	try {
		const result = await tasksService.assignTask(task_id, project_id, assigned_to);

		res.status(200).json({
			success: true,
			data: result
		})
	} catch (err) {
		next(err);
	}

}

export const updateTaskStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const task_id = Number(req.params.id);
	if (isNaN(task_id)) {
		return next({ status: 400, message: "Valid task ID is required" });
	}

	const project_id = Number(req.params.projectId);
	if (isNaN(project_id)) {
		return next({ status: 400, message: "Valid project ID is required" });
	}

	const { status } = req.body;

	try {
		const result = await tasksService.updateTaskStatus(task_id, status as TaskStatus);

		res.status(200).json({
			success: true,
			data: result
		})
	} catch (err) {
		next(err);
	}
}


export const updateTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const task_id = Number(req.params.id);
	if (isNaN(task_id)) {
		return next({ status: 400, message: "Valid task ID is required" });
	}

	const project_id = Number(req.params.projectId);
	if (isNaN(project_id)) {
		return next({ status: 400, message: "Valid project ID is required" });
	}

	const { title, description, deadline } = req.body;

	try {
		const updatedTask = await tasksService.updateTask(task_id, project_id, title, description, deadline);

		res.status(200).json({ success: true, data: updatedTask });
	} catch (err) {
		next(err);
	}
}

export const deleteTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const task_id = Number(req.params.id);
	if (isNaN(task_id)) {
		return next({ status: 400, message: "Valid task ID is required" });
	}

	const project_id = Number(req.params.projectId);
	if (isNaN(project_id)) {
		return next({ status: 400, message: "Valid project ID is required" });
	}

	try {
		const deletedTask = await tasksService.deleteTask(task_id, project_id);

		res.status(200).json({ success: true, message: "Task successfully deleted" })
	} catch (err) {
		next(err);
	}
}
