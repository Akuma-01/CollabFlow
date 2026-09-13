import { NextFunction, Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as sessionsService from '../services/sessions.service';
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
	path: '/',
};

function setSessionCookies(res: Response, tokens: sessionsService.SessionTokens): void {
	res.set('Cache-Control', 'no-store');
	res.cookie('token', tokens.accessToken, COOKIE_OPTIONS);
	res.cookie('refresh_token', tokens.refreshToken, { ...REFRESH_COOKIE_OPTIONS, expires: tokens.expiresAt });
}

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

		const tokens = await sessionsService.createSession(user);
		setSessionCookies(res, tokens);

		res.status(200).json({ success: true, data: { user } })

	} catch (err) {
		next(err);
	}
}

export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const rt = req.cookies?.refresh_token;
		if (!rt) return next(new AppError('No refresh token', 401));

		const tokens = await sessionsService.rotateSession(rt);
		setSessionCookies(res, tokens);
		res.status(200).json({ success: true });
	} catch (err) {
		next(err);
	}
};

export const logoutUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
		await sessionsService.revokeSession(req.cookies?.refresh_token, req.cookies?.token || bearer);
		res.set('Cache-Control', 'no-store');
		res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: 0 });
		res.clearCookie('refresh_token', REFRESH_COOKIE_OPTIONS);
		res.status(200).json({ success: true, message: 'Logged out' });
	} catch (err) {
		next(err);
	}
}
