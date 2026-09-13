import request from 'supertest';
import { createProject, createUser, useTestDatabase } from '../test/helpers';
import app from '../server';

useTestDatabase();

describe('Projects', () => {
	let ownerCookies: string;
	let memberCookies: string;
	let projectId: number;

	beforeEach(async () => {
		const owner = await createUser('Owner');
		ownerCookies = owner.cookies;
		memberCookies = (await createUser('Member')).cookies;
		projectId = await createProject(owner);
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
				.send({ name: 'New', email: 'new@test.com', password: 'pass123' }).expect(201);
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
