import request from 'supertest';
import pool from '../config/db';
import app from '../server';
import { addMember, createProject, createTask, createUser, TestUser, useTestDatabase } from '../test/helpers';

useTestDatabase();

describe('Task and membership history', () => {
	let owner: TestUser;
	let editor: TestUser;
	let viewer: TestUser;
	let projectId: number;
	let taskId: number;
	const taskPath = () => `/projects/${projectId}/tasks/${taskId}`;
	const memberPath = () => `/projects/${projectId}/members/${editor.id}`;
	const patch = (path: string, body: object) => request(app).patch(path).set('Cookie', owner.cookies).send(body);
	const history = async (action?: string) => {
		const res = await request(app).get(`/projects/${projectId}/activity`).set('Cookie', owner.cookies)
			.query({ limit: 100, ...(action ? { action } : {}) }).expect(200);
		return res.body.data;
	};
	const state = async () => ({
		tasks: (await pool.query('SELECT * FROM tasks ORDER BY id')).rows,
		members: (await pool.query('SELECT * FROM project_members ORDER BY project_id, user_id')).rows,
		activity: (await pool.query('SELECT * FROM activity_logs ORDER BY id')).rows,
	});

	beforeEach(async () => {
		owner = await createUser('Owner');
		editor = await createUser('Editor');
		viewer = await createUser('Viewer');
		projectId = await createProject(owner);
		await addMember(owner, projectId, editor, 'editor');
		await addMember(owner, projectId, viewer, 'viewer');
		taskId = await createTask(owner, projectId);
	});

	it('records task creation with its actual actor and initial assignee snapshot', async () => {
		const res = await request(app).post(`/projects/${projectId}/tasks`).set('Cookie', editor.cookies)
			.send({ title: 'Review API', assigned_to: viewer.id, deadline: '2026-12-31', actorId: owner.id, metadata: { forged: true } }).expect(201);
		expect((await history('TASK_CREATED'))[0]).toMatchObject({
			actor_id: editor.id, actor_name: 'Editor', entity_type: 'task', entity_id: res.body.data.id,
			metadata: { title: 'Review API', status: 'todo', deadline: '2026-12-31', assignee: { id: viewer.id, name: 'Viewer' } },
		});
		expect((await history('TASK_CREATED'))[0].metadata).not.toHaveProperty('forged');
		expect((await history('TASK_CREATED'))[0].metadata.assignee).not.toHaveProperty('email');
		expect(res.body.data.assigned_to_name).toBe('Viewer');
	});

	it('records only changed task fields with calendar-date before/after values', async () => {
		await patch(taskPath(), { title: 'Updated', description: 'New description', deadline: '2026-12-31' }).expect(200);
		expect((await history('TASK_UPDATED'))[0].metadata).toEqual({
			title: 'Updated', changes: {
				title: { from: 'First Task', to: 'Updated' }, description: { from: 'desc', to: 'New description' },
				deadline: { from: null, to: '2026-12-31' },
			},
		});
		await patch(taskPath(), { deadline: '2027-01-01' }).expect(200);
		expect((await history('TASK_UPDATED'))[0].metadata.changes).toEqual({ deadline: { from: '2026-12-31', to: '2027-01-01' } });
	});

	it('records movement, reassignment, and unassignment with readable snapshots', async () => {
		await patch(`${taskPath()}/status`, { status: 'in_progress' }).expect(200);
		await patch(`${taskPath()}/assign`, { assigned_to: editor.id }).expect(200);
		await patch(`${taskPath()}/assign`, { assigned_to: viewer.id }).expect(200);
		await patch(`${taskPath()}/assign`, { assigned_to: null }).expect(200);
		expect((await history('TASK_MOVED'))[0].metadata).toEqual({ title: 'First Task', from: 'todo', to: 'in_progress' });
		const assignments = await history('TASK_ASSIGNED');
		expect(assignments.map((event: { metadata: unknown }) => event.metadata)).toEqual([
			{ title: 'First Task', from: { id: viewer.id, name: 'Viewer' }, to: null },
			{ title: 'First Task', from: { id: editor.id, name: 'Editor' }, to: { id: viewer.id, name: 'Viewer' } },
			{ title: 'First Task', from: null, to: { id: editor.id, name: 'Editor' } },
		]);
	});

	it('keeps task history and the last title/status after deletion', async () => {
		await patch(taskPath(), { title: 'Final title' }).expect(200);
		await patch(`${taskPath()}/status`, { status: 'done' }).expect(200);
		await request(app).delete(taskPath()).set('Cookie', owner.cookies).expect(200);
		expect((await history('TASK_DELETED'))[0]).toMatchObject({ entity_id: taskId, metadata: { title: 'Final title', status: 'done' } });
		expect(await history('TASK_CREATED')).toHaveLength(1);
		expect((await pool.query('SELECT id FROM tasks WHERE id = $1', [taskId])).rowCount).toBe(0);
	});

	it('suppresses unchanged task fields, status, assignment, and member role', async () => {
		await patch(taskPath(), { deadline: '2026-12-31' }).expect(200);
		const before = await history();
		await patch(taskPath(), { title: 'First Task', description: 'desc', deadline: '2026-12-31' }).expect(200);
		await patch(`${taskPath()}/status`, { status: 'todo' }).expect(200);
		await patch(`${taskPath()}/assign`, { assigned_to: null }).expect(200);
		await patch(memberPath(), { role: 'editor' }).expect(200);
		expect(await history()).toEqual(before);
	});

	it('records member and guide additions, role changes, and removal without depending on live user records', async () => {
		const guide = await createUser('Guide');
		await request(app).post(`/projects/${projectId}/guides`).set('Cookie', owner.cookies).send({ user_id: guide.id }).expect(201);
		expect((await history('MEMBER_ADDED'))[0].metadata).toEqual({ member: { id: guide.id, name: 'Guide' }, role: 'guide' });
		await patch(memberPath(), { role: 'viewer' }).expect(200);
		await request(app).delete(memberPath()).set('Cookie', owner.cookies).expect(200);
		await pool.query('DELETE FROM users WHERE id = $1', [editor.id]);
		expect((await history('ROLE_CHANGED'))[0].metadata).toEqual({ member: { id: editor.id, name: 'Editor' }, from: 'editor', to: 'viewer' });
		expect((await history('MEMBER_REMOVED'))[0].metadata).toEqual({ member: { id: editor.id, name: 'Editor' }, role: 'viewer' });
	});

	it('clears and audits removed-member assignments only within that project', async () => {
		const secondTask = await createTask(owner, projectId);
		const otherProject = await createProject(owner, 'Other');
		await addMember(owner, otherProject, editor, 'editor');
		const otherTask = await createTask(owner, otherProject);
		for (const [project, task] of [[projectId, taskId], [projectId, secondTask], [otherProject, otherTask]]) {
			await patch(`/projects/${project}/tasks/${task}/assign`, { assigned_to: editor.id }).expect(200);
		}
		const otherBefore = (await pool.query('SELECT * FROM activity_logs WHERE project_id = $1 ORDER BY id', [otherProject])).rows;
		await request(app).delete(memberPath()).set('Cookie', owner.cookies).expect(200);
		expect((await pool.query('SELECT id, assigned_to FROM tasks ORDER BY id')).rows).toEqual([
			{ id: taskId, assigned_to: null }, { id: secondTask, assigned_to: null }, { id: otherTask, assigned_to: editor.id },
		]);
		const cleared = (await history('TASK_ASSIGNED')).slice(0, 2);
		for (const event of cleared) expect(event.metadata).toMatchObject({ from: { id: editor.id, name: 'Editor' }, to: null, reason: 'member_removed' });
		expect(cleared.map((event: { entity_id: number }) => event.entity_id)).toEqual([secondTask, taskId]);
		expect((await pool.query('SELECT * FROM activity_logs WHERE project_id = $1 ORDER BY id', [otherProject])).rows).toEqual(otherBefore);
	});

	it.each(['viewer', 'guide'])('handles existing assignments when changing an editor to %s', async role => {
		await patch(`${taskPath()}/assign`, { assigned_to: editor.id }).expect(200);
		await patch(memberPath(), { role }).expect(200);
		const task = (await pool.query('SELECT assigned_to FROM tasks WHERE id = $1', [taskId])).rows[0];
		expect(task.assigned_to).toBe(role === 'guide' ? null : editor.id);
		const events = await history('TASK_ASSIGNED');
		expect(events).toHaveLength(role === 'guide' ? 2 : 1);
		if (role === 'guide') expect(events[0].metadata).toMatchObject({ from: { id: editor.id, name: 'Editor' }, to: null, reason: 'role_changed' });
	});

	it('does not record invalid requests or unsuccessful assignments', async () => {
		const before = await state();
		await patch(taskPath(), {}).expect(400);
		await patch(`${taskPath()}/status`, { status: 'invalid' }).expect(400);
		await patch(`${taskPath()}/assign`, { assigned_to: 2147483647 }).expect(403);
		await request(app).post(`/projects/${projectId}/members`).set('Cookie', owner.cookies).send({ user_id: editor.id, role: 'editor' }).expect(409);
		expect(await state()).toEqual(before);
	});

	it('records a continuous status chain under concurrent changes', async () => {
		const responses = await Promise.all([
			patch(`${taskPath()}/status`, { status: 'in_progress' }), patch(`${taskPath()}/status`, { status: 'done' }),
		]);
		expect(responses.map(res => res.status)).toEqual([200, 200]);
		const [latest, first] = await history('TASK_MOVED');
		expect(first.metadata.from).toBe('todo');
		expect(latest.metadata.from).toBe(first.metadata.to);
		expect(new Set([first.metadata.to, latest.metadata.to])).toEqual(new Set(['in_progress', 'done']));
		expect((await pool.query('SELECT status FROM tasks WHERE id = $1', [taskId])).rows[0].status).toBe(latest.metadata.to);
	});

	it('produces one event for concurrent identical status changes', async () => {
		const responses = await Promise.all([patch(`${taskPath()}/status`, { status: 'done' }), patch(`${taskPath()}/status`, { status: 'done' })]);
		expect(responses.map(res => res.status)).toEqual([200, 200]);
		expect(await history('TASK_MOVED')).toHaveLength(1);
	});

	it('preserves both fields and their separate history under concurrent partial edits', async () => {
		const responses = await Promise.all([patch(taskPath(), { title: 'New title' }), patch(taskPath(), { description: 'New description' })]);
		expect(responses.map(res => res.status)).toEqual([200, 200]);
		expect((await pool.query('SELECT title, description FROM tasks WHERE id = $1', [taskId])).rows[0])
			.toEqual({ title: 'New title', description: 'New description' });
		expect((await history('TASK_UPDATED')).map((event: { metadata: { changes: object } }) => event.metadata.changes))
			.toEqual(expect.arrayContaining([{ title: { from: 'First Task', to: 'New title' } }, { description: { from: 'desc', to: 'New description' } }]));
	});

	it('records a continuous role chain under concurrent changes', async () => {
		const responses = await Promise.all([patch(memberPath(), { role: 'viewer' }), patch(memberPath(), { role: 'guide' })]);
		expect(responses.map(res => res.status)).toEqual([200, 200]);
		const [latest, first] = await history('ROLE_CHANGED');
		expect(first.metadata.from).toBe('editor');
		expect(latest.metadata.from).toBe(first.metadata.to);
		expect(new Set([first.metadata.to, latest.metadata.to])).toEqual(new Set(['viewer', 'guide']));
	});

	it.each(['task create', 'task edit', 'task move', 'task assign', 'task delete', 'member add', 'member remove', 'role change', 'guide add'])
	('rolls back %s when logging fails', async operation => {
		const candidate = await createUser('Candidate');
		const run = () => {
			switch (operation) {
				case 'task create': return request(app).post(`/projects/${projectId}/tasks`).set('Cookie', owner.cookies).send({ title: 'New' });
				case 'task edit': return patch(taskPath(), { title: 'New' });
				case 'task move': return patch(`${taskPath()}/status`, { status: 'done' });
				case 'task assign': return patch(`${taskPath()}/assign`, { assigned_to: editor.id });
				case 'task delete': return request(app).delete(taskPath()).set('Cookie', owner.cookies);
				case 'member add': return request(app).post(`/projects/${projectId}/members`).set('Cookie', owner.cookies).send({ user_id: candidate.id, role: 'editor' });
				case 'member remove': return request(app).delete(memberPath()).set('Cookie', owner.cookies);
				case 'role change': return patch(memberPath(), { role: 'viewer' });
				default: return request(app).post(`/projects/${projectId}/guides`).set('Cookie', owner.cookies).send({ user_id: candidate.id });
			}
		};
		const before = await state();
		await pool.query(`CREATE FUNCTION fail_mutation_log() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN RAISE EXCEPTION 'Injected log failure'; END; $$;
			CREATE TRIGGER fail_mutation_log BEFORE INSERT ON activity_logs FOR EACH ROW EXECUTE FUNCTION fail_mutation_log()`);
		const log = jest.spyOn(console, 'error').mockImplementation(() => {});
		try { await run().expect(500); }
		finally {
			log.mockRestore();
			await pool.query('DROP TRIGGER fail_mutation_log ON activity_logs; DROP FUNCTION fail_mutation_log()');
		}
		expect(await state()).toEqual(before);
		await run().expect(['task create', 'member add', 'guide add'].includes(operation) ? 201 : 200);
	});

	it.each(['remove', 'guide'])('rolls back membership, assignments, and earlier log inserts if a later automatic unassignment fails (%s)', async operation => {
		const secondTask = await createTask(owner, projectId);
		for (const id of [taskId, secondTask]) await patch(`/projects/${projectId}/tasks/${id}/assign`, { assigned_to: editor.id }).expect(200);
		const before = await state();
		await pool.query(`CREATE FUNCTION fail_later_log() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN IF NEW.action = 'TASK_ASSIGNED' AND NEW.entity_id = ${secondTask} THEN RAISE EXCEPTION 'Injected later log failure'; END IF; RETURN NEW; END; $$;
			CREATE TRIGGER fail_later_log BEFORE INSERT ON activity_logs FOR EACH ROW EXECUTE FUNCTION fail_later_log()`);
		const log = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const query = operation === 'remove' ? request(app).delete(memberPath()).set('Cookie', owner.cookies) : patch(memberPath(), { role: 'guide' });
			await query.expect(500);
		} finally {
			log.mockRestore();
			await pool.query('DROP TRIGGER fail_later_log ON activity_logs; DROP FUNCTION fail_later_log()');
		}
		expect(await state()).toEqual(before);
	});
});
