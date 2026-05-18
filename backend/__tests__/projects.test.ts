import request from 'supertest';
import pool from '../config/db';
import app from '../server';

const OWNER = { name: 'Owner', email: 'owner@test.com', password: 'secret123' };
const MEMBER = { name: 'Member', email: 'member@test.com', password: 'secret123' };

// Helper: extract cookie values stripped of attributes, ready to send back
function parseCookies(res: request.Response): string {
	return ([] as string[])
		.concat(res.headers['set-cookie'] ?? [])
		.map(c => c.split(';')[0])
		.join('; ');
}

async function loginAs(user: typeof OWNER): Promise<string> {
	await request(app).post('/auth/register').send(user).catch(() => { });
	const res = await request(app).post('/auth/login').send({ email: user.email, password: user.password });
	return parseCookies(res);
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

describe('Projects', () => {
	let ownerCookies: string;
	let memberCookies: string;
	let projectId: number;

	beforeEach(async () => {
		ownerCookies = await loginAs(OWNER);
		memberCookies = await loginAs(MEMBER);

		const res = await request(app)
			.post('/projects')
			.set('Cookie', ownerCookies)
			.send({ title: 'Test Project' });
		projectId = res.body.data.id;
	});

	describe('POST /projects', () => {
		it('creates a project and returns 201', async () => {
			const res = await request(app)
				.post('/projects')
				.set('Cookie', ownerCookies)
				.send({ title: 'New Project' });
			expect(res.status).toBe(201);
			expect(res.body.data).toHaveProperty('title', 'New Project');
		});

		it('returns 401 when not authenticated', async () => {
			const res = await request(app).post('/projects').send({ title: 'Fail' });
			expect(res.status).toBe(401);
		});
	});

	describe('GET /projects/:id', () => {
		it('returns project details for the owner', async () => {
			const res = await request(app)
				.get(`/projects/${projectId}`)
				.set('Cookie', ownerCookies);
			expect(res.status).toBe(200);
			expect(res.body.data).toHaveProperty('id', projectId);
		});

		it('returns 403 for a non-member', async () => {
			const res = await request(app)
				.get(`/projects/${projectId}`)
				.set('Cookie', memberCookies);
			expect(res.status).toBe(403);
		});
	});

	describe('POST /projects/:id/members', () => {
		it('adds a member with editor role', async () => {
			const memberRes = await request(app)
				.post('/auth/register')
				.send({ name: 'New', email: 'new@test.com', password: 'pass123' });
			const memberId = memberRes.body.data.id;

			const res = await request(app)
				.post(`/projects/${projectId}/members`)
				.set('Cookie', ownerCookies)
				.send({ user_id: memberId, role: 'editor' });
			expect(res.status).toBe(201);
		});

		it('returns 403 when a non-owner tries to add members', async () => {
			const res = await request(app)
				.post(`/projects/${projectId}/members`)
				.set('Cookie', memberCookies)
				.send({ user_id: 999, role: 'editor' });
			expect(res.status).toBe(403);
		});
	});

	describe('DELETE /projects/:id', () => {
		it('deletes the project when called by owner', async () => {
			const res = await request(app)
				.delete(`/projects/${projectId}`)
				.set('Cookie', ownerCookies);
			expect(res.status).toBe(200);
		});

		it('returns 403 when a non-owner tries to delete', async () => {
			const res = await request(app)
				.delete(`/projects/${projectId}`)
				.set('Cookie', memberCookies);
			expect(res.status).toBe(403);
		});
	});
});
