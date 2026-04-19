import { NextFunction, Request, Response } from 'express';
import * as authService from '../services/auth.service';

export const registerUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const { name, email, password } = req.body;

	try {
		const result = await authService.registerUser(name, email, password);

		res.status(201).json({ success: true, data: result })
	} catch (err) {
		next(err);
	}
}

export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
	const { email, password } = req.body;

	try {
		const result = await authService.loginUser(email, password);

		res.status(200).json({ success: true, data: result })

	} catch (err) {
		next(err);
	}

}
