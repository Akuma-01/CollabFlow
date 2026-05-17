import { Request, Response, Router } from 'express';
import { loginUser, logoutUser, refreshToken, registerUser } from '../controllers/auth.controller';
import authMiddleware from '../middlewares/auth.middleware';
import authLimiter from '../middlewares/authLimiter.middleware';
import validate from '../middlewares/validate';
import { loginSchema, registerSchema } from '../schemas/auth.schema';

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), registerUser);
router.post("/login", authLimiter, validate(loginSchema), loginUser);
router.post('/logout', logoutUser);
router.post('/refresh', refreshToken);

router.get("/me", authMiddleware, (req: Request, res: Response) => {
	res.json({
		success: true,
		data: req.user
	})
})

export default router;

