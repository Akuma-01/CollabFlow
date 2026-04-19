import { NextFunction, Request, Response } from "express";
import { ZodType, z } from "zod";

const validate = (schema: ZodType) => {
	return (req: Request, res: Response, next: NextFunction) => {
		const result = schema.safeParse(req.body);

		if (!result.success) {
			res.status(400).json({
				success: false,
				message: "Validation failed",
				errors: result.error.issues.map(e => ({
					field: e.path.join('.'),
					message: e.message
				}))
			});
			return;
		}

		req.body = result.data;
		next();
	}
}

export default validate;
