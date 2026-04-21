import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	message: {
		error: 'Too many requests. Please try again later.'
	},
	standardHeaders: true,
	legacyHeaders: false,
});

export default authLimiter;
