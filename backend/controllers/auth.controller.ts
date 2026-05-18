import { NextFunction, Request, Response } from 'express';
import pool from '../config/db';
import * as authService from '../services/auth.service';
import * as tokenService from '../services/token.service';
import { isUser } from '../services/users.service';
import { AppError } from '../utils/AppError';

const COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
	maxAge: 15 * 60 * 1000, // 15 mins
	path: '/',
};

const REFRESH_COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
	maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
		const { user } = await authService.loginUser(email, password);

		const accessToken = tokenService.signAccessToken({ id: user.id, email: user.email, name: user.name });
		const refreshToken = tokenService.signRefreshToken({ id: user.id });

		res.cookie('token', accessToken, COOKIE_OPTIONS);
		res.cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);

		res.status(200).json({ success: true, data: { user } })

	} catch (err) {
		next(err);
	}
}

export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const rt = req.cookies?.refresh_token;
		if (!rt) return next(new AppError('No refresh token', 401));

		const payload = tokenService.verifyRefreshToken(rt);
		if (!(await isUser(payload.id))) return next(new AppError('User no longer exists', 401));

		// Look up fresh user data
		const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [payload.id]);
		const user = result.rows[0];

		const newAccessToken = tokenService.signAccessToken({ id: user.id, email: user.email, name: user.name });
		res.cookie('token', newAccessToken, COOKIE_OPTIONS);
		res.status(200).json({ success: true });
	} catch (err) {
		console.error('REFRESH ERROR:', err);
		return next(new AppError('Invalid or expired refresh token', 401));
	}
};

export const logoutUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: 0 });
	res.clearCookie('refresh_token', { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
	res.status(200).json({ success: true, message: 'Logged out' });
}
