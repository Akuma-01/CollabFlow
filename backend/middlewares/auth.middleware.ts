import { NextFunction, Request, Response } from 'express';
import {isUser} from '../services/projects.service';
import jwt from 'jsonwebtoken';

const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const authHeader = req.headers.authorization;

		if (!authHeader) {
			return next({ status: 401, message: "No token provided" });
		}

		// extract bearer token
		const parts = authHeader.split(" ");

		if (parts.length != 2 || parts[0] !== "Bearer") {
			return next({ status: 401, message: "Invalid token format" })
		}

		const token = parts[1];

		// verufy token
		const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
			id: number;
			email: string;
		};
		
		if (!(await isUser(decoded.id))) {
			return next({status: 401, message: "User no longer exists"});
		}
		// attach decoded user to req.user
		req.user = decoded;

		next();
	} catch (err) {
		return next({ status: 401, message: "Invalid or expired token" })
	}
}

export default authMiddleware;
