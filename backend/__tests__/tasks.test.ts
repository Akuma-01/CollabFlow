import request from 'supertest';
import { addMember, createProject, createTask, createUser, TestUser, useTestDatabase } from '../test/helpers';
import app from '../server';

useTestDatabase();

describe('Tasks', () => {
	let owner: TestUser;
	let editor: TestUser;
	let viewer: TestUser;
	let projectId: number;
	let taskId: number;

	beforeEach(async () => {
		owner = await createUser('Owner');
		editor = await createUser('Editor');
		viewer = await createUser('Viewer');

		projectId = await createProject(owner, 'Task Project');
		await addMember(owner, projectId, editor, 'editor');
		await addMember(owner, projectId, viewer, 'viewer');
		taskId = await createTask(owner, projectId);
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
