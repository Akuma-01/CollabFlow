import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

const frontendOrigin = new URL(process.env.FRONTEND_URL || 'http://localhost:3001').origin;

// CORS alone does not stop cross-origin form POSTs. Protect cookie-changing
// auth endpoints, including refresh/logout, when cookies use SameSite=None.
export default function authOrigin(req: Request, _res: Response, next: NextFunction): void {
	const origin = req.get('Origin');
	if (req.method === 'POST' && origin && origin !== frontendOrigin) {
		return next(new AppError('Untrusted request origin', 403));
	}
	next(); // Non-browser API clients may omit Origin.
}
