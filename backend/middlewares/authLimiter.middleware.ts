import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	message: {
		error: 'Too many requests. Please try again later.'
	},
	standardHeaders: true,
	legacyHeaders: false,
});

const authLimiter = (req: Request, res: Response, next: NextFunction) => {
	if (process.env.NODE_ENV === 'test') return next();
	return limiter(req, res, next);
};

export default authLimiter;
