import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import pool from '../config/db';
import app from '../server';
import { parseCookies, useTestDatabase } from '../test/helpers';

const BASE_USER = { name: 'Alice', email: 'alice@test.com', password: 'secret123' };
useTestDatabase();

async function login(): Promise<request.Response> {
	return request(app).post('/auth/login').send(BASE_USER).expect(200);
}

function cookieValue(res: request.Response, name: string): string {
	const cookie = parseCookies(res).split('; ').find(value => value.startsWith(`${name}=`));
	if (!cookie) throw new Error(`Missing ${name} cookie`);
	return cookie.slice(name.length + 1);
}

describe('POST /auth/register', () => {
	it('persists a hashed password and returns only public user fields', async () => {
		const res = await request(app).post('/auth/register').send(BASE_USER).expect(201);
		expect(res.body.data).toEqual({ id: expect.any(Number), name: BASE_USER.name, email: BASE_USER.email });
		const { rows } = await pool.query('SELECT password FROM users WHERE id = $1', [res.body.data.id]);
		expect(rows[0].password).not.toBe(BASE_USER.password);
		expect(await bcrypt.compare(BASE_USER.password, rows[0].password)).toBe(true);
	});

	it('rejects duplicate email with 409', async () => {
		await request(app).post('/auth/register').send(BASE_USER).expect(201);
		await request(app).post('/auth/register').send(BASE_USER).expect(409);
		expect((await pool.query('SELECT id FROM users WHERE email = $1', [BASE_USER.email])).rowCount).toBe(1);
	});

	it('allows exactly one concurrent registration for the same email', async () => {
		const responses = await Promise.all(Array.from({ length: 3 }, () =>
			request(app).post('/auth/register').send(BASE_USER)
		));
		expect(responses.map(res => res.status).sort()).toEqual([201, 409, 409]);
		expect((await pool.query('SELECT id FROM users WHERE email = $1', [BASE_USER.email])).rowCount).toBe(1);
		await login();
	});

	it.each([
		['missing name', { email: BASE_USER.email, password: BASE_USER.password }],
		['invalid email', { ...BASE_USER, email: 'invalid' }],
		['short password', { ...BASE_USER, password: '123' }],
	])('rejects %s without creating a user', async (_label, body) => {
		await request(app).post('/auth/register').send(body).expect(400);
		expect((await pool.query('SELECT id FROM users')).rowCount).toBe(0);
	});
});

describe('Authentication sessions', () => {
	let userId: number;
	beforeEach(async () => {
		const res = await request(app).post('/auth/register').send(BASE_USER).expect(201);
		userId = res.body.data.id;
	});

	it('logs in with HttpOnly cookies and the intended access/refresh lifetimes', async () => {
		const res = await login();
		const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
		expect(cookies).toEqual(expect.arrayContaining([
			expect.stringMatching(/^token=.*Max-Age=900;.*HttpOnly; SameSite=Lax$/),
			expect.stringMatching(/^refresh_token=.*Max-Age=604800;.*HttpOnly; SameSite=Lax$/),
		]));
		for (const [name, secret, lifetime] of [
			['token', process.env.JWT_SECRET!, 900],
			['refresh_token', process.env.JWT_REFRESH_SECRET!, 604800],
		] as const) {
			const payload = jwt.verify(cookieValue(res, name), secret) as jwt.JwtPayload;
			expect(payload.id).toBe(userId);
			expect(payload.exp! - payload.iat!).toBe(lifetime);
		}
		expect(res.body.data.user).not.toHaveProperty('password');
	});

	it.each([
		['incorrect password', { ...BASE_USER, password: 'wrongpassword' }],
		['unknown email', { ...BASE_USER, email: 'unknown@test.com' }],
	])('rejects an %s without issuing session cookies', async (_label, body) => {
		const res = await request(app).post('/auth/login').send(body).expect(400);
		expect(res.body.message).toBe('Invalid email or password');
		expect(res.headers['set-cookie']).toBeUndefined();
	});

	it.each(['cookie', 'bearer'])('authenticates /auth/me using an access token via %s', async transport => {
		const res = await login();
		const query = request(app).get('/auth/me');
		if (transport === 'cookie') query.set('Cookie', parseCookies(res));
		else query.set('Authorization', `Bearer ${cookieValue(res, 'token')}`);
		const me = await query.expect(200);
		expect(me.body.data).toMatchObject({ id: userId, email: BASE_USER.email });
		expect(me.body.data).not.toHaveProperty('password');
	});

	it('rejects requests without an access token', async () => {
		await request(app).get('/auth/me').expect(401);
	});

	it.each(['expired', 'wrong signature', 'malformed', 'refresh token'])('rejects an %s access token', async kind => {
		let token = 'not-a-jwt';
		if (kind === 'expired') token = jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: -1 });
		if (kind === 'wrong signature') token = jwt.sign({ id: userId }, 'wrong-secret');
		if (kind === 'refresh token') token = cookieValue(await login(), 'refresh_token');
		await request(app).get('/auth/me').set('Cookie', `token=${token}`).expect(401);
	});

	it('refreshes an expired access token with current user details', async () => {
		const res = await login();
		await pool.query('UPDATE users SET name = $1 WHERE id = $2', ['Alice Updated', userId]);
		const expired = jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: -1 });
		const refreshed = await request(app).post('/auth/refresh')
			.set('Cookie', `token=${expired}; refresh_token=${cookieValue(res, 'refresh_token')}`).expect(200);
		const me = await request(app).get('/auth/me').set('Cookie', parseCookies(refreshed)).expect(200);
		expect(me.body.data.name).toBe('Alice Updated');
	});

	it.each(['missing', 'expired', 'wrong signature', 'malformed', 'access token'])('rejects a %s refresh token', async kind => {
		const query = request(app).post('/auth/refresh');
		let token = 'not-a-jwt';
		if (kind === 'expired') token = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: -1 });
		if (kind === 'wrong signature') token = jwt.sign({ id: userId }, 'wrong-secret');
		if (kind === 'access token') token = cookieValue(await login(), 'token');
		if (kind !== 'missing') query.set('Cookie', `refresh_token=${token}`);
		const res = await query.expect(401);
		expect(res.headers['set-cookie']).toBeUndefined();
	});

	it('rejects access and refresh tokens for a deleted user', async () => {
		const res = await login();
		await pool.query('DELETE FROM users WHERE id = $1', [userId]);
		await request(app).get('/auth/me').set('Cookie', parseCookies(res)).expect(401);
		await request(app).post('/auth/refresh').set('Cookie', parseCookies(res)).expect(401);
	});

	it('clears both cookies on logout and ends the browser refresh flow', async () => {
		const browser = request.agent(app);
		await browser.post('/auth/login').send(BASE_USER).expect(200);
		await browser.get('/auth/me').expect(200);
		const res = await browser.post('/auth/logout').expect(200);
		expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
			expect.stringMatching(/^token=;.*Expires=Thu, 01 Jan 1970/),
			expect.stringMatching(/^refresh_token=;.*Expires=Thu, 01 Jan 1970/),
		]));
		await browser.get('/auth/me').expect(401);
		await browser.post('/auth/refresh').expect(401);
	});
});
