import request from 'supertest';
import pool from '../config/db';
import app from '../server';
import { addMember, createProject, createTask, createUser, TestUser, useTestDatabase } from '../test/helpers';

useTestDatabase();

describe('Project resource isolation', () => {
	let owner: TestUser;
	let outsider: TestUser;
	let member: TestUser;
	let privateProject: number;
	let otherProject: number;
	let taskId: number;

	beforeEach(async () => {
		owner = await createUser('Owner');
		outsider = await createUser('Outsider');
		member = await createUser('Member');
		privateProject = await createProject(owner, 'Private Project');
		otherProject = await createProject(outsider, 'Other Project');
		await addMember(owner, privateProject, member, 'editor');
		taskId = await createTask(owner, privateProject);
	});

	it.each(['', '/tasks', '/members'])('denies a non-member reading a private project%s', async suffix => {
		await request(app).get(`/projects/${privateProject}${suffix}`)
			.set('Cookie', outsider.cookies).expect(403);
	});

	it.each(['/projects', '/dashboard'])('excludes other projects from %s', async path => {
		const res = await request(app).get(path).set('Cookie', outsider.cookies).expect(200);
		expect(res.body.data.map((project: { id: number }) => project.id)).toEqual([otherProject]);
	});

	it.each([
		['edit', '', { title: 'Tampered' }],
		['move', '/status', { status: 'done' }],
		['assign', '/assign', { assigned_to: null }],
		['delete', '', {}],
	])('cannot %s another project’s task through an authorized project URL', async (action, suffix, body) => {
		const before = (await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId])).rows[0];
		const path = `/projects/${otherProject}/tasks/${taskId}${suffix}`;
		const query = action === 'delete' ? request(app).delete(path) : request(app).patch(path).send(body);
		await query.set('Cookie', outsider.cookies).expect(404);
		const after = (await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId])).rows[0];
		expect(after).toEqual(before);
	});

	it.each(['change role', 'remove'])('cannot %s for a member of another project', async action => {
		const path = `/projects/${otherProject}/members/${member.id}`;
		const query = action === 'remove' ? request(app).delete(path) : request(app).patch(path).send({ role: 'viewer' });
		await query.set('Cookie', outsider.cookies).expect(404);
		const { rows } = await pool.query('SELECT * FROM project_members WHERE user_id = $1', [member.id]);
		expect(rows).toEqual([{ user_id: member.id, project_id: privateProject, role: 'editor' }]);
	});

	it.each(['create', 'assign'])('cannot %s a task assigned to a user outside the project', async action => {
		const query = action === 'create'
			? request(app).post(`/projects/${privateProject}/tasks`).send({ title: 'Invalid assignment', assigned_to: outsider.id })
			: request(app).patch(`/projects/${privateProject}/tasks/${taskId}/assign`).send({ assigned_to: outsider.id });
		await query.set('Cookie', owner.cookies).expect(403);
		const { rows } = await pool.query('SELECT id, assigned_to FROM tasks WHERE project_id = $1', [privateProject]);
		expect(rows).toEqual([{ id: taskId, assigned_to: null }]);
	});

	it('revokes project and assigned-task visibility when a member is removed', async () => {
		await request(app).patch(`/projects/${privateProject}/tasks/${taskId}/assign`)
			.set('Cookie', owner.cookies).send({ assigned_to: member.id }).expect(200);
		const before = await request(app).get('/dashboard/tasks').set('Cookie', member.cookies).expect(200);
		expect(before.body.data.map((task: { id: number }) => task.id)).toEqual([taskId]);
		await request(app).delete(`/projects/${privateProject}/members/${member.id}`)
			.set('Cookie', owner.cookies).expect(200);
		await request(app).get(`/projects/${privateProject}/tasks`).set('Cookie', member.cookies).expect(403);
		const after = await request(app).get('/dashboard/tasks').set('Cookie', member.cookies).expect(200);
		expect(after.body.data).toEqual([]);
	});

	it('lists only tasks assigned to the caller, including a project owner', async () => {
		const ownTask = await createTask(outsider, otherProject);
		await request(app).patch(`/projects/${otherProject}/tasks/${ownTask}/assign`)
			.set('Cookie', outsider.cookies).send({ assigned_to: outsider.id }).expect(200);
		await request(app).patch(`/projects/${privateProject}/tasks/${taskId}/assign`)
			.set('Cookie', owner.cookies).send({ assigned_to: member.id }).expect(200);
		const res = await request(app).get('/dashboard/tasks').set('Cookie', outsider.cookies).expect(200);
		expect(res.body.data.map((task: { id: number }) => task.id)).toEqual([ownTask]);
		await request(app).get('/dashboard/tasks').expect(401);
	});
});
