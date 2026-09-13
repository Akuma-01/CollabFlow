import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import pool from '../config/db';
import app from '../server';
import * as activityService from '../services/activity.service';
import { addMember, createProject, createUser, TestUser, useTestDatabase } from '../test/helpers';

useTestDatabase();

describe('Project activity', () => {
	let owner: TestUser;
	let projectId: number;
	const history = () => request(app).get(`/projects/${projectId}/activity`).set('Cookie', owner.cookies);
	const rename = (title: string) => request(app).patch(`/projects/${projectId}`).set('Cookie', owner.cookies).send({ title });

	beforeEach(async () => {
		owner = await createUser('Owner');
		projectId = await createProject(owner, 'Original');
	});

	it('records creation using the authenticated actor and server-selected metadata', async () => {
		const created = await request(app).post('/projects').set('Cookie', owner.cookies)
			.send({ title: 'New', actorId: 999, action: 'FORGED', metadata: { password: 'secret' } }).expect(201);
		const res = await request(app).get(`/projects/${created.body.data.id}/activity`).set('Cookie', owner.cookies).expect(200);
		expect(res.body.data).toEqual([{
			id: expect.any(String), project_id: created.body.data.id, actor_id: owner.id, actor_name: 'Owner',
			action: 'PROJECT_CREATED', entity_type: 'project', entity_id: created.body.data.id,
			metadata: { title: 'New' }, created_at: expect.any(String),
		}]);
		expect(res.body.nextCursor).toBeNull();
		expect(res.headers['cache-control']).toBe('no-store');
	});

	it('records the old and new title newest first and skips no-op renames', async () => {
		await rename('Renamed').expect(200);
		await rename('Renamed').expect(200);
		const res = await history().expect(200);
		expect(res.body.data.map((event: { action: string }) => event.action)).toEqual(['PROJECT_UPDATED', 'PROJECT_CREATED']);
		expect(res.body.data[0].metadata).toEqual({ from: { title: 'Original' }, to: { title: 'Renamed' } });
	});

	it('returns an empty page for a project that predates activity logging', async () => {
		const { rows } = await pool.query('INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id', ['Existing', owner.id]);
		const res = await request(app).get(`/projects/${rows[0].id}/activity`).set('Cookie', owner.cookies).expect(200);
		expect(res.body).toEqual({ success: true, data: [], nextCursor: null });
	});

	it('retains the actor name recorded at the time of the event', async () => {
		await pool.query('UPDATE users SET name = $1 WHERE id = $2', ['Owner Renamed', owner.id]);
		await rename('Renamed').expect(200);
		const res = await history().expect(200);
		expect(res.body.data.map((event: { actor_name: string }) => event.actor_name)).toEqual(['Owner Renamed', 'Owner']);
	});

	it.each(['editor', 'viewer', 'guide'] as const)('allows %s to read history but not rename the project', async role => {
		const member = await createUser('Member');
		await addMember(owner, projectId, member, role);
		const res = await request(app).get(`/projects/${projectId}/activity`).set('Cookie', member.cookies).expect(200);
		expect(res.body.data).toHaveLength(1);
		await request(app).patch(`/projects/${projectId}`).set('Cookie', member.cookies).send({ title: 'Denied' }).expect(403);
		expect((await history()).body.data).toHaveLength(1);
	});

	it('denies unauthenticated users, outsiders, and removed members', async () => {
		const member = await createUser('Member');
		await request(app).get(`/projects/${projectId}/activity`).expect(401);
		await request(app).get(`/projects/${projectId}/activity`).set('Cookie', member.cookies).expect(403);
		await addMember(owner, projectId, member, 'viewer');
		await request(app).delete(`/projects/${projectId}/members/${member.id}`).set('Cookie', owner.cookies).expect(200);
		await request(app).get(`/projects/${projectId}/activity`).set('Cookie', member.cookies).expect(403);
		// The query itself must still protect records if access changed after middleware ran.
		expect(await activityService.list(projectId, member.id, { limit: 20 })).toEqual({ data: [], nextCursor: null });
	});

	it('scopes results to the requested project even when the actor owns both', async () => {
		const other = await createProject(owner, 'Other');
		await rename('Renamed').expect(200);
		const res = await request(app).get(`/projects/${other}/activity`).set('Cookie', owner.cookies).expect(200);
		expect(res.body.data).toHaveLength(1);
		expect(res.body.data[0]).toMatchObject({ project_id: other, metadata: { title: 'Other' } });
	});

	it('paginates without duplicates or gaps while new events arrive', async () => {
		await rename('First').expect(200);
		await rename('Second').expect(200);
		const all = await history().expect(200);
		const first = await history().query({ limit: '2' }).expect(200);
		expect(first.body.nextCursor).toBe(first.body.data[1].id);
		await rename('Arrived after first page').expect(200);
		const second = await history().query({ limit: '2', before: first.body.nextCursor }).expect(200);
		expect([...first.body.data, ...second.body.data]).toEqual(all.body.data);
		expect(second.body.nextCursor).toBeNull();
	});

	it('filters by action and computes the cursor within the filtered results', async () => {
		await rename('First').expect(200);
		await rename('Second').expect(200);
		const first = await history().query({ action: 'PROJECT_UPDATED', limit: '1' }).expect(200);
		const second = await history().query({ action: 'PROJECT_UPDATED', limit: '1', before: first.body.nextCursor }).expect(200);
		expect(first.body.data[0].metadata.to.title).toBe('Second');
		expect(second.body.data[0].metadata.to.title).toBe('First');
		expect(second.body.nextCursor).toBeNull();
	});

	it('preserves BIGSERIAL cursor precision beyond the JavaScript safe-integer range', async () => {
		await pool.query("SELECT setval('activity_logs_id_seq', 9007199254740992, true)");
		await rename('First').expect(200);
		await rename('Second').expect(200);
		const first = await history().query({ limit: '1' }).expect(200);
		expect(first.body.data[0].id).toBe('9007199254740994');
		const next = await history().query({ limit: '1', before: first.body.nextCursor }).expect(200);
		expect(next.body.data[0].id).toBe('9007199254740993');
	});

	it.each([
		'limit=0', 'limit=101', 'limit=1.5', 'limit=abc', 'limit=1&limit=2',
		'before=-1', 'before=abc', 'before=9223372036854775808', 'action=UNKNOWN', 'unexpected=1',
	])('rejects invalid pagination/filter input: %s', async query => {
		await request(app).get(`/projects/${projectId}/activity?${query}`).set('Cookie', owner.cookies).expect(400);
	});

	it('rejects failed mutations without creating events', async () => {
		await rename('').expect(400);
		await request(app).patch('/projects/2147483647').set('Cookie', owner.cookies).send({ title: 'Missing' }).expect(404);
		expect((await history()).body.data).toHaveLength(1);
	});

	it('records a consistent transition chain for concurrent renames', async () => {
		const responses = await Promise.all([rename('Alpha'), rename('Beta')]);
		expect(responses.map(res => res.status)).toEqual([200, 200]);
		const res = await history().query({ action: 'PROJECT_UPDATED' }).expect(200);
		const [latest, earliest] = res.body.data;
		expect(earliest.metadata.from.title).toBe('Original');
		expect(latest.metadata.from.title).toBe(earliest.metadata.to.title);
		expect(new Set([earliest.metadata.to.title, latest.metadata.to.title])).toEqual(new Set(['Alpha', 'Beta']));
		const project = await request(app).get(`/projects/${projectId}`).set('Cookie', owner.cookies).expect(200);
		expect(project.body.data.title).toBe(latest.metadata.to.title);
	});

	it.each(['create', 'rename'])('rolls back project %s when the activity insert fails', async operation => {
		await pool.query(`
			CREATE FUNCTION fail_activity_insert() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN RAISE EXCEPTION 'Injected activity write failure'; END; $$;
			CREATE TRIGGER fail_activity_insert BEFORE INSERT ON activity_logs
			FOR EACH ROW EXECUTE FUNCTION fail_activity_insert();
		`);
		const log = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const query = operation === 'create'
				? request(app).post('/projects').set('Cookie', owner.cookies).send({ title: 'Must roll back' })
				: rename('Must roll back');
			await query.expect(500);
		} finally {
			log.mockRestore();
			await pool.query('DROP TRIGGER fail_activity_insert ON activity_logs; DROP FUNCTION fail_activity_insert()');
		}
		expect((await pool.query('SELECT id, title FROM projects')).rows).toEqual([{ id: projectId, title: 'Original' }]);
		expect((await history()).body.data).toHaveLength(1);
		await rename('Recovery').expect(200);
		expect((await history()).body.data).toHaveLength(2);
	});

	it('preserves actor snapshots when a former owner is deleted', async () => {
		const nextOwner = await createUser('NextOwner');
		// Exercise FK retention after an administrative ownership change.
		await pool.query('UPDATE projects SET owner_id = $1 WHERE id = $2', [nextOwner.id, projectId]);
		await pool.query('DELETE FROM users WHERE id = $1', [owner.id]);
		const res = await request(app).get(`/projects/${projectId}/activity`).set('Cookie', nextOwner.cookies).expect(200);
		expect(res.body.data[0]).toMatchObject({ actor_id: null, actor_name: 'Owner', metadata: { title: 'Original' } });
	});

	it('deletes project history with its project', async () => {
		await request(app).delete(`/projects/${projectId}`).set('Cookie', owner.cookies).expect(200);
		expect((await pool.query('SELECT id FROM activity_logs WHERE project_id = $1', [projectId])).rowCount).toBe(0);
		await history().expect(404);
	});

	it('can reapply the migration without altering existing history', async () => {
		const before = await history().expect(200);
		await pool.query(readFileSync(path.join(__dirname, '..', 'migrations', '002_activity_logs.sql'), 'utf8'));
		expect((await history().expect(200)).body).toEqual(before.body);
	});
});
