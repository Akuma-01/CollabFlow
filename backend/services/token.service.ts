import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_SECRET as string;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

export interface AccessTokenPayload {
	id: number;
	email: string;
	name: string;
}

export const signAccessToken = (payload: AccessTokenPayload): string =>
	jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });

export const signRefreshToken = (payload: { id: number }): string =>
	jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });

export const verifyRefreshToken = (token: string): { id: number } =>
	jwt.verify(token, REFRESH_SECRET) as { id: number };
