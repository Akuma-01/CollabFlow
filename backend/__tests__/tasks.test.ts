import request from 'supertest';
import pool from '../config/db';
import app from '../server';

const OWNER = { name: 'Owner', email: 'owner@test.com', password: 'secret123' };
const EDITOR = { name: 'Editor', email: 'editor@test.com', password: 'secret123' };
const VIEWER = { name: 'Viewer', email: 'viewer@test.com', password: 'secret123' };

// Helper: extract cookie values stripped of attributes, ready to send back
function parseCookies(res: request.Response): string {
	return ([] as string[])
		.concat(res.headers['set-cookie'] ?? [])
		.map(c => c.split(';')[0])
		.join('; ');
}

async function loginAs(user: typeof OWNER): Promise<{ cookies: string; id: number }> {
	await request(app).post('/auth/register').send(user).catch(() => { });
	const loginRes = await request(app).post('/auth/login').send({ email: user.email, password: user.password });
	const cookies = parseCookies(loginRes);
	const me = await request(app).get('/auth/me').set('Cookie', cookies);
	return { cookies, id: me.body.data.id };
}


afterAll(async () => {
	await pool.end();
});

describe('Tasks', () => {
	let owner: { cookies: string; id: number };
	let editor: { cookies: string; id: number };
	let viewer: { cookies: string; id: number };
	let projectId: number;
	let taskId: number;

	beforeEach(async () => {
		await pool.query('DELETE FROM project_members');
		await pool.query('DELETE FROM tasks');
		await pool.query('DELETE FROM projects');
		await pool.query('DELETE FROM users');

		owner = await loginAs(OWNER);
		editor = await loginAs(EDITOR);
		viewer = await loginAs(VIEWER);

		const proj = await request(app)
			.post('/projects')
			.set('Cookie', owner.cookies)
			.send({ title: 'Task Project' });
		projectId = proj.body.data.id;

		await request(app)
			.post(`/projects/${projectId}/members`)
			.set('Cookie', owner.cookies)
			.send({ user_id: editor.id, role: 'editor' });

		await request(app)
			.post(`/projects/${projectId}/members`)
			.set('Cookie', owner.cookies)
			.send({ user_id: viewer.id, role: 'viewer' });

		const task = await request(app)
			.post(`/projects/${projectId}/tasks`)
			.set('Cookie', owner.cookies)
			.send({ title: 'First Task', description: 'desc' });
		taskId = task.body.data.id;
	});

	describe('POST /projects/:id/tasks', () => {
		it('owner can create a task', async () => {
			const res = await request(app)
				.post(`/projects/${projectId}/tasks`)
				.set('Cookie', owner.cookies)
				.send({ title: 'New Task' });
			expect(res.status).toBe(201);
			expect(res.body.data).toHaveProperty('title', 'New Task');
		});

		it('editor can create a task', async () => {
			const res = await request(app)
				.post(`/projects/${projectId}/tasks`)
				.set('Cookie', editor.cookies)
				.send({ title: 'Editor Task' });
			expect(res.status).toBe(201);
		});

		it('viewer cannot create a task', async () => {
			const res = await request(app)
				.post(`/projects/${projectId}/tasks`)
				.set('Cookie', viewer.cookies)
				.send({ title: 'Viewer Task' });
			expect(res.status).toBe(403);
		});
	});

	describe('PATCH /projects/:id/tasks/:taskId (updateTask)', () => {
		it('updates title, description, and deadline', async () => {
			const res = await request(app)
				.patch(`/projects/${projectId}/tasks/${taskId}`)
				.set('Cookie', owner.cookies)
				.send({ title: 'Updated', description: 'new desc', deadline: '2026-12-31' });
			expect(res.status).toBe(200);
			expect(res.body.data.title).toBe('Updated');
			expect(res.body.data.deadline).toContain('2026-12-31');
		});
	});

	describe('PATCH /projects/:id/tasks/:taskId/status', () => {
		it('owner can update status', async () => {
			const res = await request(app)
				.patch(`/projects/${projectId}/tasks/${taskId}/status`)
				.set('Cookie', owner.cookies)
				.send({ status: 'in_progress' });
			expect(res.status).toBe(200);
		});

		it('viewer cannot update status', async () => {
			const res = await request(app)
				.patch(`/projects/${projectId}/tasks/${taskId}/status`)
				.set('Cookie', viewer.cookies)
				.send({ status: 'done' });
			expect(res.status).toBe(403);
		});
	});

	describe('PATCH /projects/:id/tasks/:taskId/assign', () => {
		it('owner can assign a task to a member', async () => {
			const res = await request(app)
				.patch(`/projects/${projectId}/tasks/${taskId}/assign`)
				.set('Cookie', owner.cookies)
				.send({ assigned_to: editor.id });
			expect(res.status).toBe(200);
		});
	});

	describe('DELETE /projects/:id/tasks/:taskId', () => {
		it('owner can delete a task', async () => {
			const res = await request(app)
				.delete(`/projects/${projectId}/tasks/${taskId}`)
				.set('Cookie', owner.cookies);
			expect(res.status).toBe(200);
		});

		it('viewer cannot delete a task', async () => {
			const res = await request(app)
				.delete(`/projects/${projectId}/tasks/${taskId}`)
				.set('Cookie', viewer.cookies);
			expect(res.status).toBe(403);
		});
	});
});
