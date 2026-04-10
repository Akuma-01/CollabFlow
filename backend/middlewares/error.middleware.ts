import { NextFunction, Request, Response } from 'express';
import { AppError } from '../types';


const errorMiddleware = (err: AppError, req: Request, res: Response, next: NextFunction): void => {
	if (err.message === "EMAIL_EXISTS") {
		res.status(400).json({
			success: false,
			message: "Email already exists"
		})
		return;
	}

	if (err.code === "23503") {
		res.status(400).json({
			success: false,
			message: "Cannot perform this action due to existing dependencies"
		});
		return;
	}

	if (err.code === "23514") {
		res.status(400).json({
			success: false,
			message: "Invalid status value"
		});
		return;
	}

	res.status(err.status || 500).json({
		success: false,
		message: err.message || "Internal Server Error"
	});
};

export default errorMiddleware;
