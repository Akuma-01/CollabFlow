import { NextFunction, Request, Response } from 'express';
import { AppError } from '../types';


const errorMiddleware = (err: AppError, req: Request, res: Response, next: NextFunction): void => {
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

	if (err.code === "23505") {
		res.status(400).json({
			success: false,
			message: "This record already exists"
		});
		return;
	}

	if (err.code === "22P02") {
		res.status(400).json({
			success: false,
			message: "Number is expected"
		});
		return;
	}

	res.status(err.status || 500).json({
		success: false,
		message: err.message || "Internal Server Error"
	});
};

export default errorMiddleware;
