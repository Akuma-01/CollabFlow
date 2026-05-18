import request from 'supertest';
import pool from '../config/db';
import app from '../server';

const BASE_USER = { name: 'Alice', email: 'alice@test.com', password: 'secret123' };

// Helper: extract cookie values stripped of attributes, ready to send back
function parseCookies(res: request.Response): string {
	return ([] as string[])
		.concat(res.headers['set-cookie'] ?? [])
		.map(c => c.split(';')[0])
		.join('; ');
}

beforeEach(async () => {
	await pool.query('DELETE FROM project_members');
	await pool.query('DELETE FROM tasks');
	await pool.query('DELETE FROM projects');
	await pool.query('DELETE FROM users');
});

afterAll(async () => {
	await pool.end();
});

describe('POST /auth/register', () => {
	it('creates a user and returns 201', async () => {
		const res = await request(app).post('/auth/register').send(BASE_USER);
		expect(res.status).toBe(201);
		expect(res.body.data).toHaveProperty('email', BASE_USER.email);
		expect(res.body.data).not.toHaveProperty('password');
	});

	it('rejects duplicate email with 400', async () => {
		await request(app).post('/auth/register').send(BASE_USER);
		const res = await request(app).post('/auth/register').send(BASE_USER);
		expect(res.status).toBe(400);
	});

	it('rejects missing fields with 400', async () => {
		const res = await request(app).post('/auth/register').send({ email: 'x@x.com' });
		expect(res.status).toBe(400);
	});
});

describe('POST /auth/login', () => {
	beforeEach(async () => {
		await request(app).post('/auth/register').send(BASE_USER);
	});

	it('logs in and sets token cookies', async () => {
		const res = await request(app).post('/auth/login').send({
			email: BASE_USER.email,
			password: BASE_USER.password,
		});
		expect(res.status).toBe(200);
		expect(res.headers['set-cookie']).toEqual(
			expect.arrayContaining([
				expect.stringContaining('token='),
				expect.stringContaining('refresh_token='),
			])
		);
	});

	it('rejects wrong password with 400', async () => {
		const res = await request(app).post('/auth/login').send({
			email: BASE_USER.email,
			password: 'wrongpassword',
		});
		expect(res.status).toBe(400);
	});
});

describe('POST /auth/refresh', () => {
	it('issues a new access token when refresh token is valid', async () => {
		await request(app).post('/auth/register').send(BASE_USER);
		const loginRes = await request(app).post('/auth/login').send({
			email: BASE_USER.email,
			password: BASE_USER.password,
		});
		const cookies = parseCookies(loginRes);

		const res = await request(app).post('/auth/refresh').set('Cookie', cookies);
		expect(res.status).toBe(200);
		expect(res.headers['set-cookie']).toEqual(
			expect.arrayContaining([expect.stringContaining('token=')])
		);
	});

	it('returns 401 with no refresh token cookie', async () => {
		const res = await request(app).post('/auth/refresh');
		expect(res.status).toBe(401);
	});
});

describe('GET /auth/me', () => {
	it('returns the current user when authenticated', async () => {
		await request(app).post('/auth/register').send(BASE_USER);
		const loginRes = await request(app).post('/auth/login').send({
			email: BASE_USER.email,
			password: BASE_USER.password,
		});
		const cookies = parseCookies(loginRes);

		const res = await request(app).get('/auth/me').set('Cookie', cookies);
		expect(res.status).toBe(200);
		expect(res.body.data).toHaveProperty('email', BASE_USER.email);
	});

	it('returns 401 when not authenticated', async () => {
		const res = await request(app).get('/auth/me');
		expect(res.status).toBe(401);
	});
});
