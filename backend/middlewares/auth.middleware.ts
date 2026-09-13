import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../services/token.service';
import { getSessionUser } from '../services/sessions.service';
import { AppError } from '../utils/AppError';

const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		let token: string | undefined = req.cookies?.token;

		if (!token) {
			const authHeader = req.headers.authorization;
			if (authHeader) {
				const parts = authHeader.split(' ');
				if (parts.length === 2 && parts[0] === 'Bearer') {
					token = parts[1];
				}
			}
		}

		if (!token) {
			return next(new AppError('No token provided', 401));
		}

		// Use verifyAccessToken from token.service so access tokens are always
		// verified with JWT_SECRET — never with JWT_REFRESH_SECRET.
		const decoded = verifyAccessToken(token);

		const user = await getSessionUser(decoded.id, decoded.sid);
		if (!user) {
			return next(new AppError('Invalid or expired session', 401));
		}

		req.user = user;
		res.set('Cache-Control', 'no-store');
		next();
	} catch (err) {
		next(err);
	}
}

export default authMiddleware;
