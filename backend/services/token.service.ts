import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from '../utils/AppError';

export interface AccessTokenPayload {
	id: number;
	email: string;
	name: string;
	sid: string;
}

const sessionClaims = z.object({
	id: z.number().int().positive(),
	sid: z.uuid(),
	exp: z.number().int(),
	iat: z.number().int(),
});
const accessClaims = sessionClaims.extend({
	type: z.literal('access'),
	email: z.string(),
	name: z.string(),
});
const refreshClaims = sessionClaims.extend({ type: z.literal('refresh'), jti: z.uuid() });

export const signAccessToken = (payload: AccessTokenPayload): string =>
	jwt.sign({ ...payload, type: 'access' }, process.env.JWT_SECRET as string, { algorithm: 'HS256', expiresIn: '15m' });

export const verifyAccessToken = (token: string): z.infer<typeof accessClaims> => {
	const payload = accessClaims.safeParse(verify(token, process.env.JWT_SECRET as string));
	if (!payload.success) throw new AppError('Invalid or expired token', 401);
	return payload.data;
};

export const signRefreshToken = (payload: { id: number; sid: string; exp: number }): string =>
	jwt.sign({ ...payload, type: 'refresh', jti: randomUUID() }, process.env.JWT_REFRESH_SECRET as string, { algorithm: 'HS256' });

export const verifyRefreshToken = (token: string): z.infer<typeof refreshClaims> => {
	const payload = refreshClaims.safeParse(verify(token, process.env.JWT_REFRESH_SECRET as string));
	if (!payload.success) throw new AppError('Invalid or expired token', 401);
	return payload.data;
};

function verify(token: string, secret: string): unknown {
	try {
		return jwt.verify(token, secret, { algorithms: ['HS256'] });
	} catch (error) {
		if (error instanceof jwt.JsonWebTokenError) throw new AppError('Invalid or expired token', 401);
		throw error;
	}
}
