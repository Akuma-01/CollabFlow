import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import pool from '../config/db';
import app from '../server';
import { cookieValue, parseCookies, useTestDatabase } from '../test/helpers';

const USER = { name: 'Alice', email: 'alice@test.com', password: 'secret123' };
useTestDatabase();

beforeEach(async () => {
	await request(app).post('/auth/register').send(USER).expect(201);
});

const login = () => request(app).post('/auth/login').send(USER).expect(200);
const refresh = (res: request.Response) => request(app).post('/auth/refresh').set('Cookie', parseCookies(res));
const me = (res: request.Response) => request(app).get('/auth/me').set('Cookie', parseCookies(res));
const claims = (res: request.Response) => jwt.decode(cookieValue(res, 'refresh_token')) as jwt.JwtPayload;

describe('Persisted sessions', () => {
	it('stores only a refresh-token digest and binds access and refresh tokens to one session', async () => {
		const res = await login();
		const payload = claims(res);
		const access = jwt.decode(cookieValue(res, 'token')) as jwt.JwtPayload;
		const { rows } = await pool.query('SELECT * FROM auth_sessions');
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: payload.sid, user_id: payload.id, revoked_at: null,
			refresh_token_hash: createHash('sha256').update(cookieValue(res, 'refresh_token')).digest('hex'),
		});
		expect(JSON.stringify(rows)).not.toContain(cookieValue(res, 'refresh_token'));
		expect(access).toMatchObject({ sid: payload.sid, id: payload.id, type: 'access' });
		expect(payload.type).toBe('refresh');
		expect(rows[0].expires_at.getTime()).toBe(payload.exp! * 1000);
		expect(res.headers['cache-control']).toBe('no-store');
	});

	it('creates independent sessions for separate logins in the same second', async () => {
		const [first, second] = await Promise.all([login(), login()]);
		expect(claims(first).sid).not.toBe(claims(second).sid);
		expect(cookieValue(first, 'refresh_token')).not.toBe(cookieValue(second, 'refresh_token'));
		await refresh(first).expect(200);
		await refresh(second).expect(200);
	});

	it('rotates refresh tokens without extending the original seven-day session', async () => {
		const original = await login();
		const rotated = await refresh(original).expect(200);
		const next = await refresh(rotated).expect(200);
		expect(new Set([original, rotated, next].map(res => cookieValue(res, 'refresh_token'))).size).toBe(3);
		for (const res of [rotated, next]) {
			expect(claims(res)).toMatchObject({ sid: claims(original).sid, exp: claims(original).exp });
			expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
				expect.stringContaining(`Expires=${new Date(claims(original).exp! * 1000).toUTCString()}`),
			]));
			await me(res).expect(200);
		}
		const { rows } = await pool.query('SELECT refresh_token_hash FROM auth_sessions');
		expect(rows).toEqual([{ refresh_token_hash: createHash('sha256').update(cookieValue(next, 'refresh_token')).digest('hex') }]);
	});

	it('revokes the session on replay, including its newest refresh and access tokens', async () => {
		const original = await login();
		const rotated = await refresh(original).expect(200);
		const newest = await refresh(rotated).expect(200);
		const replay = await refresh(original).expect(401);
		expect(replay.headers['set-cookie']).toBeUndefined();
		await refresh(newest).expect(401);
		await me(newest).expect(401);
		await me(original).expect(401);
		expect((await pool.query('SELECT revoked_at FROM auth_sessions')).rows[0].revoked_at).toBeInstanceOf(Date);
	});

	it('serializes concurrent uses of one refresh token and revokes the replayed session', async () => {
		const original = await login();
		const responses = await Promise.all([refresh(original), refresh(original)]);
		expect(responses.map(res => res.status).sort()).toEqual([200, 401]);
		const winner = responses.find(res => res.status === 200)!;
		await refresh(winner).expect(401);
		await me(winner).expect(401);
		expect((await pool.query('SELECT * FROM auth_sessions')).rowCount).toBe(1);
	});

	it('replay on one device leaves another login active', async () => {
		const first = await login();
		const second = await login();
		await refresh(first).expect(200);
		await refresh(first).expect(401);
		await me(second).expect(200);
		await refresh(second).expect(200);
	});

	it('rejects a database-expired session even while its signed tokens are unexpired', async () => {
		const res = await login();
		await pool.query("UPDATE auth_sessions SET created_at = NOW() - INTERVAL '8 days', expires_at = NOW() - INTERVAL '1 day'");
		await refresh(res).expect(401);
		await me(res).expect(401);
	});

	it('cascades session deletion when its user is removed', async () => {
		const res = await login();
		await pool.query('DELETE FROM users WHERE id = $1', [claims(res).id]);
		expect((await pool.query('SELECT id FROM auth_sessions')).rowCount).toBe(0);
		await refresh(res).expect(401);
		await me(res).expect(401);
	});

	it.each(['sid', 'id', 'jti', 'type'])('rejects invalid signed %s claims without revoking a legitimate session', async field => {
		const res = await login();
		const payload = { ...claims(res), [field]: field === 'id' ? '1' : 'invalid' };
		const token = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!);
		await request(app).post('/auth/refresh').set('Cookie', `refresh_token=${token}`).expect(401);
		await refresh(res).expect(200);
	});

	it('rejects a signed token without a persisted session and legacy tokens without session claims', async () => {
		const res = await login();
		const unknown = jwt.sign({ ...claims(res), sid: randomUUID() }, process.env.JWT_REFRESH_SECRET!);
		const legacyRefresh = jwt.sign({ id: claims(res).id }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
		const legacyAccess = jwt.sign({ id: claims(res).id, name: USER.name, email: USER.email }, process.env.JWT_SECRET!, { expiresIn: '15m' });
		for (const token of [unknown, legacyRefresh]) {
			await request(app).post('/auth/refresh').set('Cookie', `refresh_token=${token}`).expect(401);
		}
		await request(app).get('/auth/me').set('Cookie', `token=${legacyAccess}`).expect(401);
		await me(res).expect(200);
	});

	it('can reapply the additive migration without losing users or sessions', async () => {
		const res = await login();
		await pool.query(readFileSync(path.join(__dirname, '..', 'migrations', '001_auth_sessions.sql'), 'utf8'));
		await me(res).expect(200);
		await refresh(res).expect(200);
		expect((await pool.query('SELECT id FROM users')).rowCount).toBe(1);
	});
});

describe('Logout revocation', () => {
	it('revokes copied access and refresh tokens while leaving another device active', async () => {
		const first = await login();
		const second = await login();
		await request(app).post('/auth/logout').set('Cookie', parseCookies(first)).expect(200);
		await refresh(first).expect(401);
		await me(first).expect(401);
		await request(app).get('/auth/me').set('Authorization', `Bearer ${cookieValue(first, 'token')}`).expect(401);
		await me(second).expect(200);
		await refresh(second).expect(200);
	});

	it('revokes the latest session using an older rotated refresh token', async () => {
		const original = await login();
		const rotated = await refresh(original).expect(200);
		await request(app).post('/auth/logout').set('Cookie', `refresh_token=${cookieValue(original, 'refresh_token')}`).expect(200);
		await refresh(rotated).expect(401);
		await me(rotated).expect(401);
	});

	it.each(['cookie', 'bearer'])('revokes via an access %s when the refresh cookie is missing', async transport => {
		const res = await login();
		const query = request(app).post('/auth/logout');
		if (transport === 'cookie') query.set('Cookie', `token=${cookieValue(res, 'token')}`);
		else query.set('Authorization', `Bearer ${cookieValue(res, 'token')}`);
		await query.expect(200);
		await refresh(res).expect(401);
		await me(res).expect(401);
	});

	it('is idempotent for repeated logout, missing cookies, and malformed tokens', async () => {
		const res = await login();
		for (let i = 0; i < 2; i++) {
			await request(app).post('/auth/logout').set('Cookie', parseCookies(res)).expect(200);
		}
		await request(app).post('/auth/logout').expect(200);
		await request(app).post('/auth/logout').set('Cookie', 'refresh_token=invalid; token=invalid').expect(200);
	});

	it('cannot revive a session when logout races with rotation', async () => {
		const res = await login();
		const [rotated, logout] = await Promise.all([
			refresh(res), request(app).post('/auth/logout').set('Cookie', parseCookies(res)),
		]);
		expect(logout.status).toBe(200);
		expect([200, 401]).toContain(rotated.status);
		await refresh(res).expect(401);
		await me(res).expect(401);
		if (rotated.status === 200) {
			await refresh(rotated).expect(401);
			await me(rotated).expect(401);
		}
	});

	it.each(['refresh', 'logout'])('rolls back failed %s writes and reports a server error without changing cookies', async endpoint => {
		const res = await login();
		await pool.query(`
			CREATE FUNCTION fail_session_update() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN RAISE EXCEPTION 'Injected session write failure'; END; $$;
			CREATE TRIGGER fail_session_update BEFORE UPDATE ON auth_sessions
			FOR EACH ROW EXECUTE FUNCTION fail_session_update();
		`);
		const log = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const failed = await request(app).post(`/auth/${endpoint}`).set('Cookie', parseCookies(res)).expect(500);
			expect(failed.headers['set-cookie']).toBeUndefined();
			expect(failed.body.message).toBe('Internal Server Error');
		} finally {
			log.mockRestore();
			await pool.query('DROP TRIGGER fail_session_update ON auth_sessions; DROP FUNCTION fail_session_update()');
		}
		await me(res).expect(200);
		await refresh(res).expect(200);
	});
});

describe('Browser authentication origin checks', () => {
	it.each(['register', 'login', 'refresh', 'logout'])('rejects an untrusted origin on %s without changing a session', async endpoint => {
		const res = await login();
		await request(app).post(`/auth/${endpoint}`).set('Origin', 'https://attacker.example')
			.set('Cookie', parseCookies(res)).send(USER).expect(403);
		await me(res).expect(200);
		await refresh(res).expect(200);
	});

	it('accepts the configured frontend origin for cookie authentication', async () => {
		const res = await request(app).post('/auth/login').set('Origin', 'http://localhost:3001').send(USER).expect(200);
		const rotated = await refresh(res).set('Origin', 'http://localhost:3001').expect(200);
		await request(app).post('/auth/logout').set('Origin', 'http://localhost:3001')
			.set('Cookie', parseCookies(rotated)).expect(200);
		await refresh(rotated).expect(401);
	});

	it('rejects an opaque browser origin', async () => {
		await request(app).post('/auth/login').set('Origin', 'null').send(USER).expect(403);
	});
});
