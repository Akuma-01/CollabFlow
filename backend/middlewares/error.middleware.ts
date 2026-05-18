import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

const PG_ERRORS: Record<string, { status: number; message: string }> = {
	'23503': { status: 400, message: 'Cannot perform this action due to existing dependencies' },
	'23514': { status: 400, message: 'Invalid status value' },
	'23505': { status: 409, message: 'This record already exists' },
	'22P02': { status: 400, message: 'A number was expected but not provided' },
};

const errorMiddleware = (err: AppError, req: Request, res: Response, next: NextFunction): void => {
	// PostgreSQL error codes
	if (err && typeof err === 'object' && 'code' in err) {
		const pgErr = PG_ERRORS[(err as { code: string }).code];
		if (pgErr) {
			res.status(pgErr.status).json({ success: false, message: pgErr.message });
			return;
		}
	}

	// Known application errors (AppError instances or plain { status, message } objects)
	if (err instanceof AppError) {
		res.status(err.status).json({ success: false, message: err.message });
		return;
	}

	// Plain objects with status/message (e.g. next({ status: 403, message: '...' }))
	if (err && typeof err === 'object' && 'status' in err && 'message' in err) {
		const plainErr = err as { status: number; message: string };
		res.status(plainErr.status).json({ success: false, message: plainErr.message });
		return;
	}

	console.error('Unhandled error:', err);
	res.status(500).json({ success: false, message: 'Internal Server Error' });
};

export default errorMiddleware;
