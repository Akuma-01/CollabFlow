import { NextFunction, Request, Response } from 'express';
import * as authService from '../services/auth.service';

const COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
	maxAge: 60 * 60 * 1000, // 1 hour
	path: '/',
};

export const registerUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const { name, email, password } = req.body;

	try {
		const result = await authService.registerUser(name, email, password);

		res.status(201).json({ success: true, data: result })
	} catch (err) {
		next(err);
	}
}

export const loginUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const { email, password } = req.body;

	try {
		const { token, user } = await authService.loginUser(email, password);

		res.cookie('token', token, COOKIE_OPTIONS);

		res.status(200).json({ success: true, data: { user } })

	} catch (err) {
		next(err);
	}
}

export const logoutUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: 0 });
	res.status(200).json({ success: true, message: 'Logged out' });
}
