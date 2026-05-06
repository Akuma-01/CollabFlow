import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isUser } from '../services/users.service';
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

		// verufy token
		const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
			id: number;
			email: string;
			name: string;
		};

		if (!(await isUser(decoded.id))) {
			return next(new AppError('User no longer exists', 401));
		}
		// attach decoded user to req.user
		req.user = decoded;
		next();
	} catch (err) {
		return next(new AppError('Invalid or expired token', 401))
	}
}

export default authMiddleware;
