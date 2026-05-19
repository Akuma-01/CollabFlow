import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
	id: number;
	email: string;
	name: string;
}

export const signAccessToken = (payload: AccessTokenPayload): string =>
	jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '15m' });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
	jwt.verify(token, process.env.JWT_SECRET as string) as AccessTokenPayload;

export const signRefreshToken = (payload: { id: number }): string =>
	jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '7d' });

export const verifyRefreshToken = (token: string): { id: number } =>
	jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as { id: number };
