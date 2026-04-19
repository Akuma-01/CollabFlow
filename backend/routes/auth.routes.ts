import { Request, Response, Router } from 'express';
import { loginUser, registerUser } from '../controllers/auth.controller';
import authMiddleware from '../middlewares/auth.middleware';
import validate from '../middlewares/validate';
import { loginSchema, registerSchema } from '../schemas/auth.schema';

const router = Router();

router.post("/register", validate(registerSchema), registerUser);
router.post("/login", validate(loginSchema), loginUser);

router.get("/me", authMiddleware, (req: Request, res: Response) => {
	res.json({
		success: true,
		data: req.user
	})
})

export default router;

