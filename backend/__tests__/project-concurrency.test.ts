import { setTimeout as delay } from 'node:timers/promises';
import { PoolClient } from 'pg';
import request from 'supertest';
import pool from '../config/db';
import app from '../server';
import { addMember, createProject, createTask, createUser, TestUser, useTestDatabase } from '../test/helpers';

useTestDatabase();

// Hold the project row until PostgreSQL confirms the HTTP request is waiting.
// This places a committed membership change between middleware and the write,
// without mocking authorization or relying on request scheduling/timed sleeps.
async function whileRequestWaits(
	projectId: number,
	start: () => request.Test,
	change: (client: PoolClient) => Promise<void>,
): Promise<request.Response> {
	const blocker = await pool.connect();
	let pending: Promise<request.Response> | undefined;
	try {
		await blocker.query('BEGIN');
		const { rows } = await blocker.query('SELECT pg_backend_pid() AS pid');
		await blocker.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
		pending = start().timeout(4000).then(res => res);
		// Attach a handler immediately; the original promise is still awaited below.
		pending.catch(() => {});
		const deadline = Date.now() + 3000;
		while (true) {
			const waiting = await pool.query(
				`SELECT 1 FROM pg_stat_activity
				 WHERE datname = current_database() AND $1 = ANY(pg_blocking_pids(pid))`, [rows[0].pid]
			);
			if (waiting.rowCount) break;
			if (Date.now() >= deadline) throw new Error('HTTP request did not wait on the project lock');
			await delay(10);
		}
		await change(blocker);
		await blocker.query('COMMIT');
		return await pending;
	} finally {
		await blocker.query('ROLLBACK');
		blocker.release();
		await pending?.catch(() => {});
	}
}

describe('Project mutation concurrency', () => {
	let owner: TestUser;
	let editor: TestUser;
	let projectId: number;
	let taskId: number;
	const taskPath = () => `/projects/${projectId}/tasks/${taskId}`;
	const state = async () => ({
		tasks: (await pool.query('SELECT * FROM tasks ORDER BY id')).rows,
		activity: (await pool.query('SELECT * FROM activity_logs ORDER BY id')).rows,
	});

	beforeEach(async () => {
		owner = await createUser('Owner');
		editor = await createUser('Editor');
		projectId = await createProject(owner);
		await addMember(owner, projectId, editor, 'editor');
		taskId = await createTask(owner, projectId);
	});

	it.each(['removed', 'viewer', 'guide'])('rejects a queued editor mutation after the actor becomes %s', async role => {
		const before = await state();
		const res = await whileRequestWaits(projectId,
			() => request(app).patch(taskPath()).set('Cookie', editor.cookies).send({ title: 'Unauthorized edit' }),
			async client => {
				if (role === 'removed') {
					await client.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, editor.id]);
				} else {
					await client.query('UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3', [role, projectId, editor.id]);
				}
			});
		expect(res.status).toBe(403);
		expect(await state()).toEqual(before);
	});

	it.each(['removed', 'guide'])('rejects a queued assignment after the assignee becomes %s', async role => {
		const before = await state();
		const res = await whileRequestWaits(projectId,
			() => request(app).patch(`${taskPath()}/assign`).set('Cookie', owner.cookies).send({ assigned_to: editor.id }),
			async client => {
				if (role === 'removed') {
					await client.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, editor.id]);
				} else {
					await client.query("UPDATE project_members SET role = 'guide' WHERE project_id = $1 AND user_id = $2", [projectId, editor.id]);
				}
			});
		expect(res.status).toBe(403);
		expect(await state()).toEqual(before);
	});

	it('allows another project to change while a mutation waits', async () => {
		const otherProject = await createProject(owner, 'Other');
		const otherTask = await createTask(owner, otherProject);
		const res = await whileRequestWaits(projectId,
			() => request(app).patch(taskPath()).set('Cookie', editor.cookies).send({ title: 'Updated' }),
			async () => {
				await request(app).patch(`/projects/${otherProject}/tasks/${otherTask}/status`)
					.set('Cookie', owner.cookies).send({ status: 'done' }).timeout(1000).expect(200);
			});
		expect(res.status).toBe(200);
		expect((await pool.query('SELECT id, title, status FROM tasks ORDER BY id')).rows).toEqual([
			{ id: taskId, title: 'Updated', status: 'todo' }, { id: otherTask, title: 'First Task', status: 'done' },
		]);
	});
});
