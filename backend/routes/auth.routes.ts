import { Request, Response, Router } from 'express';
import { loginUser, registerUser } from '../controllers/auth.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

router.get("/me", authMiddleware, (req: Request, res: Response) => {
	res.json({
		success: true,
		data: req.user
	})
})

export default router;

