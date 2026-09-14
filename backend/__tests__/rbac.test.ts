import request from 'supertest';
import pool from '../config/db';
import app from '../server';
import { addMember, createProject, createTask, createUser, TestUser, useTestDatabase } from '../test/helpers';

useTestDatabase();

describe('Role boundaries through the API', () => {
	let owner: TestUser;
	let editor: TestUser;
	let viewer: TestUser;
	let guide: TestUser;
	let projectId: number;
	let taskId: number;
	let users: Record<string, TestUser>;

	beforeEach(async () => {
		owner = await createUser('Owner');
		editor = await createUser('Editor');
		viewer = await createUser('Viewer');
		guide = await createUser('Guide');
		users = { owner, editor, viewer, guide };
		projectId = await createProject(owner);
		await addMember(owner, projectId, editor, 'editor');
		await addMember(owner, projectId, viewer, 'viewer');
		await addMember(owner, projectId, guide, 'guide');
		taskId = await createTask(owner, projectId);
	});

	it.each(['owner', 'editor', 'viewer', 'guide'])('%s can read project, members, and tasks', async role => {
		for (const suffix of ['', '/members', '/tasks']) {
			const res = await request(app).get(`/projects/${projectId}${suffix}`)
				.set('Cookie', users[role].cookies).expect(200);
			if (suffix === '') expect(res.body.data.id).toBe(projectId);
			if (suffix === '/tasks') expect(res.body.data.map((task: { id: number }) => task.id)).toEqual([taskId]);
			if (suffix === '/members') expect(res.body.data.map((member: { role: string }) => member.role))
				.toEqual(['owner', 'editor', 'viewer', 'guide']);
		}
	});

	it.each(['owner', 'editor', 'viewer', 'guide'])('enforces %s permissions for the complete task workflow', async role => {
		const cookies = users[role].cookies;
		const canWrite = role === 'owner' || role === 'editor';
		const status = canWrite ? 200 : 403;
		const before = (await pool.query('SELECT * FROM tasks ORDER BY id')).rows;
		await request(app).post(`/projects/${projectId}/tasks`).set('Cookie', cookies)
			.send({ title: 'New task' }).expect(canWrite ? 201 : 403);
		await request(app).patch(`/projects/${projectId}/tasks/${taskId}`).set('Cookie', cookies)
			.send({ title: 'Updated task' }).expect(status);
		await request(app).patch(`/projects/${projectId}/tasks/${taskId}/status`).set('Cookie', cookies)
			.send({ status: 'done' }).expect(status);
		await request(app).patch(`/projects/${projectId}/tasks/${taskId}/assign`).set('Cookie', cookies)
			.send({ assigned_to: editor.id }).expect(status);
		if (canWrite) {
			const { rows } = await pool.query('SELECT title, status, assigned_to FROM tasks WHERE id = $1', [taskId]);
			expect(rows[0]).toEqual({ title: 'Updated task', status: 'done', assigned_to: editor.id });
		}
		await request(app).delete(`/projects/${projectId}/tasks/${taskId}`).set('Cookie', cookies).expect(status);
		const after = (await pool.query('SELECT * FROM tasks ORDER BY id')).rows;
		if (canWrite) expect(after.map(task => task.title)).toEqual(['New task']);
		else expect(after).toEqual(before);
	});

	it.each(['editor', 'viewer', 'guide'])('%s cannot manage project settings or membership', async role => {
		const cookies = users[role].cookies;
		await request(app).patch(`/projects/${projectId}`).set('Cookie', cookies).send({ title: 'Tampered' }).expect(403);
		await request(app).post(`/projects/${projectId}/members`).set('Cookie', cookies)
			.send({ user_id: viewer.id, role: 'editor' }).expect(403);
		await request(app).post(`/projects/${projectId}/guides`).set('Cookie', cookies)
			.send({ user_id: viewer.id }).expect(403);
		await request(app).patch(`/projects/${projectId}/members/${viewer.id}`).set('Cookie', cookies)
			.send({ role: 'editor' }).expect(403);
		await request(app).delete(`/projects/${projectId}/members/${viewer.id}`).set('Cookie', cookies).expect(403);
		await request(app).delete(`/projects/${projectId}`).set('Cookie', cookies).expect(403);
		expect((await pool.query('SELECT title FROM projects WHERE id = $1', [projectId])).rows[0].title).toBe('Test Project');
		expect((await pool.query('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, viewer.id])).rows[0].role).toBe('viewer');
	});

	it('owner can change member roles and changes take effect with existing cookies', async () => {
		await request(app).patch(`/projects/${projectId}/members/${editor.id}`).set('Cookie', owner.cookies)
			.send({ role: 'viewer' }).expect(200);
		await request(app).post(`/projects/${projectId}/tasks`).set('Cookie', editor.cookies)
			.send({ title: 'Disallowed' }).expect(403);
		await request(app).patch(`/projects/${projectId}/members/${editor.id}`).set('Cookie', owner.cookies)
			.send({ role: 'editor' }).expect(200);
		await request(app).post(`/projects/${projectId}/tasks`).set('Cookie', editor.cookies)
			.send({ title: 'Allowed' }).expect(201);
	});

	it('protects the owner from membership removal, demotion, and role escalation', async () => {
		await request(app).delete(`/projects/${projectId}/members/${owner.id}`).set('Cookie', owner.cookies).expect(403);
		await request(app).patch(`/projects/${projectId}/members/${owner.id}`).set('Cookie', owner.cookies)
			.send({ role: 'viewer' }).expect(403);
		await request(app).patch(`/projects/${projectId}/members/${editor.id}`).set('Cookie', owner.cookies)
			.send({ role: 'owner' }).expect(400);
		expect((await pool.query('SELECT owner_id FROM projects WHERE id = $1', [projectId])).rows[0].owner_id).toBe(owner.id);
	});

	it('rejects assigning tasks to a guide during creation and reassignment', async () => {
		await request(app).post(`/projects/${projectId}/tasks`).set('Cookie', owner.cookies)
			.send({ title: 'Invalid', assigned_to: guide.id }).expect(403);
		await request(app).patch(`/projects/${projectId}/tasks/${taskId}/assign`).set('Cookie', owner.cookies)
			.send({ assigned_to: guide.id }).expect(403);
		expect((await pool.query('SELECT id, assigned_to FROM tasks')).rows).toEqual([{ id: taskId, assigned_to: null }]);
	});

	it.each(['members', 'guides'])('creates one membership under concurrent duplicate %s requests', async endpoint => {
		const newcomer = await createUser('Newcomer');
		const responses = await Promise.all(Array.from({ length: 3 }, () =>
			request(app).post(`/projects/${projectId}/${endpoint}`).set('Cookie', owner.cookies)
				.send({ user_id: newcomer.id, role: 'editor' })
		));
		expect(responses.map(res => res.status).sort()).toEqual(endpoint === 'members' ? [201, 409, 409] : [201, 400, 400]);
		const { rows } = await pool.query('SELECT * FROM project_members WHERE user_id = $1', [newcomer.id]);
		expect(rows).toEqual([{ user_id: newcomer.id, project_id: projectId, role: endpoint === 'members' ? 'editor' : 'guide' }]);
		expect((await pool.query(
			"SELECT id FROM activity_logs WHERE project_id = $1 AND entity_id = $2 AND action = 'MEMBER_ADDED'",
			[projectId, newcomer.id]
		)).rowCount).toBe(1);
	});
});
