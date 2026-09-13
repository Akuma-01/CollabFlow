import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import pool from '../config/db';
import { User } from '../types';
import { AppError } from '../utils/AppError';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './token.service';

type SessionUser = Pick<User, 'id' | 'name' | 'email'>;
export interface SessionTokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: Date;
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function issueTokens(user: SessionUser, sid: string, expiresAt: Date): SessionTokens {
	return {
		accessToken: signAccessToken({ ...user, sid }),
		refreshToken: signRefreshToken({ id: user.id, sid, exp: Math.floor(expiresAt.getTime() / 1000) }),
		expiresAt,
	};
}

export async function createSession(user: SessionUser): Promise<SessionTokens> {
	const sid = randomUUID();
	const expiresAt = new Date((Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60) * 1000);
	const tokens = issueTokens(user, sid, expiresAt);
	await pool.query(
		'INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3, $4)',
		[sid, user.id, hashToken(tokens.refreshToken), expiresAt]
	);
	return tokens;
}

export async function getSessionUser(id: number, sid: string): Promise<SessionUser | undefined> {
	const { rows } = await pool.query(
		`SELECT u.id, u.name, u.email FROM auth_sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
		[sid, id]
	);
	return rows[0];
}

export async function rotateSession(token: string): Promise<SessionTokens> {
	const payload = verifyRefreshToken(token);
	const client = await pool.connect();
	let tokens: SessionTokens | undefined;
	try {
		await client.query('BEGIN');
		// Lock the session for both rotation and replay revocation. A concurrent
		// refresh or logout must observe the result of this transaction.
		const { rows } = await client.query(
			`SELECT s.refresh_token_hash, s.expires_at, u.id, u.name, u.email
			 FROM auth_sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
			 FOR UPDATE OF s`,
			[payload.sid, payload.id]
		);
		const session = rows[0];
		if (!session || session.expires_at.getTime() <= Date.now() || payload.exp <= Math.floor(Date.now() / 1000)) {
			throw new AppError('Invalid or expired session', 401);
		}

		if (!timingSafeEqual(Buffer.from(session.refresh_token_hash, 'hex'), Buffer.from(hashToken(token), 'hex'))) {
			await client.query('UPDATE auth_sessions SET revoked_at = clock_timestamp() WHERE id = $1', [payload.sid]);
		} else {
			tokens = issueTokens({ id: session.id, name: session.name, email: session.email }, payload.sid, session.expires_at);
			await client.query('UPDATE auth_sessions SET refresh_token_hash = $1 WHERE id = $2',
				[hashToken(tokens.refreshToken), payload.sid]);
		}
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
	// Throw only after committing: rolling back here would undo replay revocation.
	if (!tokens) throw new AppError('Refresh token reuse detected; sign in again', 401);
	return tokens;
}

export async function revokeSession(refreshToken?: string, accessToken?: string): Promise<void> {
	// A previously rotated but correctly signed refresh token still identifies
	// the session to log out. A valid access token is a fallback if the refresh cookie is missing or invalid.
	let payload: { id: number; sid: string } | undefined;
	for (const [token, verify] of [
		[refreshToken, verifyRefreshToken], [accessToken, verifyAccessToken],
	] as const) {
		if (!token) continue;
		try {
			payload = verify(token);
			break;
		} catch (error) {
			if (!(error instanceof AppError) || error.status !== 401) throw error;
		}
	}
	if (!payload) return;
	await pool.query(
		'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE id = $1 AND user_id = $2',
		[payload.sid, payload.id]
	);
}
