import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import WebSocket from 'ws';
import pool from '../config/db';
import app from '../server';
import { startProjectRealtime } from '../realtime/server';
import { notifyProject } from '../realtime/notifications';
import { verifyAccessToken } from '../services/token.service';
import { addMember, createProject, createTask, createUser, parseCookies, TestUser, useTestDatabase } from '../test/helpers';

useTestDatabase();
const ORIGIN = 'http://localhost:3001';
type Message = { type: string; projectId: number };
type Connection = { ws: WebSocket; messages: Message[]; closed?: number };
type Runtime = { http: Server; realtime: Awaited<ReturnType<typeof startProjectRealtime>>; url: string };
const tokenOf = (user: TestUser) => user.cookies.split('; ').find(cookie => cookie.startsWith('token='))!.slice(6);

async function until(predicate: () => boolean | Promise<boolean>, message: string, timeout = 2500) {
	const end = Date.now() + timeout;
	while (!await predicate()) {
		if (Date.now() >= end) throw new Error(`Timed out: ${message}`);
		await delay(10);
	}
}

describe('Authenticated project WebSockets', () => {
	let owner: TestUser;
	let editor: TestUser;
	let projectId: number;
	let barrierId: number;
	let taskId: number;
	let primary: Promise<Runtime> | undefined;
	let runtimes: Runtime[];
	let connections: Connection[];

	beforeEach(async () => {
		owner = await createUser('Owner');
		editor = await createUser('Editor');
		projectId = await createProject(owner);
		barrierId = await createProject(owner, 'Barrier');
		await addMember(owner, projectId, editor, 'editor');
		taskId = await createTask(owner, projectId);
		primary = undefined;
		runtimes = [];
		connections = [];
	});

	afterEach(async () => {
		for (const connection of connections) connection.ws.terminate();
		for (const runtime of runtimes) {
			await runtime.realtime.close();
			await new Promise<void>(resolve => runtime.http.close(() => resolve()));
		}
	});

	async function start(options: Parameters<typeof startProjectRealtime>[1] = {}) {
		const http = createServer(app);
		const realtime = await startProjectRealtime(http, { reconnectDelayMs: 100, ...options });
		await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
		const runtime = { http, realtime, url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}` };
		runtimes.push(runtime);
		return runtime;
	}

	async function connect(user = owner, id = projectId, runtime?: Runtime, extra: WebSocket.ClientOptions = {}) {
		const host = runtime ?? await (primary ??= start());
		const ws = new WebSocket(`${host.url}/projects/${id}/events`, { headers: { Cookie: user.cookies, Origin: ORIGIN }, ...extra });
		const connection: Connection = { ws, messages: [] };
		connections.push(connection);
		ws.on('message', data => connection.messages.push(JSON.parse(data.toString())));
		ws.on('close', code => { connection.closed = code; });
		ws.on('error', () => {});
		await until(() => connection.messages.some(message => message.type === 'project.ready'), 'project.ready');
		expect(connection.messages[0]).toEqual({ type: 'project.ready', projectId: id });
		connection.messages.length = 0;
		return connection;
	}

	async function rejected(path: string, headers: Record<string, string>, expected: number, runtime?: Runtime) {
		const host = runtime ?? await (primary ??= start());
		const ws = new WebSocket(`${host.url}${path}`, { headers });
		connections.push({ ws, messages: [] });
		ws.on('error', () => {});
		const status = await new Promise<number>((resolve, reject) => {
			ws.once('open', () => reject(new Error('Unexpected authorized connection')));
			ws.once('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode!); ws.terminate(); });
		});
		expect(status).toBe(expected);
	}

	const changeTitle = (id = projectId, title = 'Changed') => request(app).patch(`/projects/${id}`).set('Cookie', owner.cookies).send({ title }).expect(200);
	const changed = async (connection: Connection) => until(() => connection.messages.some(message => message.type === 'project.changed'), 'project.changed');

	it.each(['owner', 'editor', 'viewer', 'guide'] as const)('allows %s to subscribe to its project', async role => {
		if (role !== 'owner') await request(app).patch(`/projects/${projectId}/members/${editor.id}`).set('Cookie', owner.cookies).send({ role }).expect(200);
		const connection = await connect(role === 'owner' ? owner : editor);
		await changeTitle();
		await changed(connection);
		expect(connection.messages).toEqual([{ type: 'project.changed', projectId }]);
	});

	it('accepts an access Bearer header without placing credentials in the URL', async () => {
		const connection = await connect(owner, projectId, undefined, { headers: { Authorization: `Bearer ${tokenOf(owner)}`, Origin: ORIGIN } });
		await changeTitle();
		await changed(connection);
	});

	it.each(['missing', 'invalid', 'refresh', 'expired', 'revoked'])('rejects %s authentication before upgrading', async kind => {
		let cookies = owner.cookies;
		if (kind === 'missing') cookies = '';
		if (kind === 'invalid') cookies = 'token=invalid';
		if (kind === 'refresh') cookies = `token=${owner.cookies.split('; ').find(cookie => cookie.startsWith('refresh_token='))!.slice(14)}`;
		if (kind === 'expired') cookies = `token=${jwt.sign({ ...verifyAccessToken(tokenOf(owner)), exp: Math.floor(Date.now() / 1000) - 1 }, process.env.JWT_SECRET!)}`;
		if (kind === 'revoked') await request(app).post('/auth/logout').set('Cookie', owner.cookies).expect(200);
		await rejected(`/projects/${projectId}/events`, { Cookie: cookies, Origin: ORIGIN }, 401);
	});

	it.each(['missing', 'null', 'https://evil.example'])('rejects an untrusted Origin: %s', async origin => {
		await rejected(`/projects/${projectId}/events`, { Cookie: owner.cookies, ...(origin === 'missing' ? {} : { Origin: origin }) }, 403);
	});

	it('rejects outsiders and removed members even with valid sessions', async () => {
		await rejected(`/projects/${barrierId}/events`, { Cookie: editor.cookies, Origin: ORIGIN }, 403);
		await request(app).delete(`/projects/${projectId}/members/${editor.id}`).set('Cookie', owner.cookies).expect(200);
		await rejected(`/projects/${projectId}/events`, { Cookie: editor.cookies, Origin: ORIGIN }, 403);
	});

	it.each([['/projects/0/events', 404], ['/projects/2147483648/events', 404], ['/projects/999/events', 403], ['/events', 404], ['/projects/1/events?token=secret', 400]])
	('rejects invalid or inaccessible subscriptions: %s', async (path, status) => {
		await rejected(String(path), { Cookie: owner.cookies, Origin: ORIGIN }, Number(status));
	});

	it('isolates projects even when one user belongs to both rooms', async () => {
		const current = await connect();
		const other = await connect(owner, barrierId);
		await changeTitle();
		await changed(current);
		expect(other.messages).toEqual([]);
		await changeTitle(barrierId);
		await changed(other);
		expect(current.messages).toHaveLength(1);
	});

	it.each(['create', 'edit', 'move', 'assign', 'delete', 'member add', 'member remove', 'role change'])('publishes a committed %s mutation', async operation => {
		const candidate = operation === 'member add' ? await createUser('Candidate') : editor;
		const connection = await connect();
		const task = `/projects/${projectId}/tasks/${taskId}`;
		switch (operation) {
			case 'create': await createTask(owner, projectId); break;
			case 'edit': await request(app).patch(task).set('Cookie', owner.cookies).send({ description: 'Updated' }).expect(200); break;
			case 'move': await request(app).patch(`${task}/status`).set('Cookie', owner.cookies).send({ status: 'done' }).expect(200); break;
			case 'assign': await request(app).patch(`${task}/assign`).set('Cookie', owner.cookies).send({ assigned_to: editor.id }).expect(200); break;
			case 'delete': await request(app).delete(task).set('Cookie', owner.cookies).expect(200); break;
			case 'member add': await addMember(owner, projectId, candidate, 'viewer'); break;
			case 'member remove': await request(app).delete(`/projects/${projectId}/members/${editor.id}`).set('Cookie', owner.cookies).expect(200); break;
			default: await request(app).patch(`/projects/${projectId}/members/${editor.id}`).set('Cookie', owner.cookies).send({ role: 'viewer' }).expect(200);
		}
		await changed(connection);
		expect(connection.messages).toEqual([{ type: 'project.changed', projectId }]);
	});

	it.each(['COMMIT', 'ROLLBACK'])('sends nothing before transaction completion and respects %s', async end => {
		const connection = await connect();
		const barrier = await connect(owner, barrierId);
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query('UPDATE projects SET title = $1 WHERE id = $2', ['Pending', projectId]);
			await notifyProject(client, projectId);
			await changeTitle(barrierId);
			await changed(barrier);
			expect(connection.messages).toEqual([]);
			await client.query(end);
			if (end === 'COMMIT') await changed(connection);
			else {
				barrier.messages.length = 0;
				await changeTitle(barrierId, 'Barrier again');
				await changed(barrier);
				expect(connection.messages).toEqual([]);
			}
		} finally { await client.query('ROLLBACK'); client.release(); }
	});

	it('does not notify for rejected or unchanged operations', async () => {
		const connection = await connect();
		const barrier = await connect(owner, barrierId);
		await request(app).patch(`/projects/${projectId}/tasks/${taskId}/status`).set('Cookie', owner.cookies).send({ status: 'todo' }).expect(200);
		await request(app).patch(`/projects/${projectId}`).set('Cookie', editor.cookies).send({ title: 'Denied' }).expect(403);
		await changeTitle(barrierId);
		await changed(barrier);
		expect(connection.messages).toEqual([]);
	});

	it('rolls back a failed audited mutation without publishing', async () => {
		const connection = await connect();
		const barrier = await connect(owner, barrierId);
		await pool.query(`CREATE FUNCTION fail_realtime_log() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN RAISE EXCEPTION 'Injected log failure'; END; $$;
			CREATE TRIGGER fail_realtime_log BEFORE INSERT ON activity_logs FOR EACH ROW EXECUTE FUNCTION fail_realtime_log()`);
		const log = jest.spyOn(console, 'error').mockImplementation(() => {});
		try { await request(app).patch(`/projects/${projectId}`).set('Cookie', owner.cookies).send({ title: 'Rolled back' }).expect(500); }
		finally { log.mockRestore(); await pool.query('DROP TRIGGER fail_realtime_log ON activity_logs; DROP FUNCTION fail_realtime_log()'); }
		await changeTitle(barrierId);
		await changed(barrier);
		expect(connection.messages).toEqual([]);
		expect((await pool.query('SELECT title FROM projects WHERE id = $1', [projectId])).rows[0].title).toBe('Test Project');
	});

	it('combines a membership change and multiple automatic unassignments into one notification', async () => {
		const second = await createTask(owner, projectId);
		for (const id of [taskId, second]) await request(app).patch(`/projects/${projectId}/tasks/${id}/assign`).set('Cookie', owner.cookies).send({ assigned_to: editor.id }).expect(200);
		const connection = await connect();
		await request(app).delete(`/projects/${projectId}/members/${editor.id}`).set('Cookie', owner.cookies).expect(200);
		await changed(connection);
		expect(connection.messages).toEqual([{ type: 'project.changed', projectId }]);
		expect((await pool.query('SELECT assigned_to FROM tasks')).rows).toEqual([{ assigned_to: null }, { assigned_to: null }]);
	});

	it('disconnects removed members before delivering further project hints', async () => {
		const member = await connect(editor);
		const observer = await connect();
		await request(app).delete(`/projects/${projectId}/members/${editor.id}`).set('Cookie', owner.cookies).expect(200);
		await until(() => member.closed !== undefined, 'removed member disconnected');
		expect(member.closed).toBe(4003);
		expect(member.messages).toEqual([]);
		await changed(observer);
	});

	it('disconnects project subscribers after project deletion', async () => {
		const connection = await connect();
		await request(app).delete(`/projects/${projectId}`).set('Cookie', owner.cookies).expect(200);
		await until(() => connection.closed !== undefined, 'project deleted');
		expect(connection.closed).toBe(4003);
		expect(connection.messages).toEqual([]);
	});

	it.each(['logout', 'replay'])('disconnects a revoked session after %s while another login remains active', async operation => {
		const otherLogin = await request(app).post('/auth/login').send({ email: 'owner@test.com', password: 'secret123' }).expect(200);
		const otherUser = { id: owner.id, cookies: parseCookies(otherLogin) };
		const connection = await connect();
		const independent = await connect(otherUser);
		if (operation === 'logout') await request(app).post('/auth/logout').set('Cookie', owner.cookies).expect(200);
		else {
			await request(app).post('/auth/refresh').set('Cookie', owner.cookies).expect(200);
			await request(app).post('/auth/refresh').set('Cookie', owner.cookies).expect(401);
		}
		await until(() => connection.closed !== undefined, 'session revoked');
		expect(connection.closed).toBe(4001);
		await request(app).patch(`/projects/${projectId}`).set('Cookie', otherUser.cookies).send({ title: 'Still authorized' }).expect(200);
		await changed(independent);
		expect(independent.closed).toBeUndefined();
	});

	it('closes an idle connection when its access token expires', async () => {
		const token = jwt.sign({ ...verifyAccessToken(tokenOf(owner)), exp: Math.floor(Date.now() / 1000) + 2 }, process.env.JWT_SECRET!);
		const connection = await connect({ ...owner, cookies: `token=${token}` });
		await until(() => connection.closed !== undefined, 'access expiry');
		expect(connection.closed).toBe(4001);
	});

	it('periodically detects direct session revocation without relying on a notification', async () => {
		const runtime = await start({ heartbeatMs: 100 });
		const connection = await connect(owner, projectId, runtime);
		await pool.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1', [verifyAccessToken(tokenOf(owner)).sid]);
		await until(() => connection.closed !== undefined, 'periodic session check');
		expect(connection.closed).toBe(4001);
	});

	it('terminates a dead connection that does not answer heartbeat pings', async () => {
		const runtime = await start({ heartbeatMs: 100 });
		const connection = await connect(owner, projectId, runtime, { autoPong: false });
		await until(() => connection.closed !== undefined, 'dead connection');
		expect(connection.closed).toBe(1006);
	});

	it('rejects client-supplied messages instead of allowing forged events or room changes', async () => {
		const connection = await connect(editor);
		const observer = await connect();
		connection.ws.send(JSON.stringify({ type: 'project.changed', projectId: barrierId }));
		await until(() => connection.closed !== undefined, 'forged message rejected');
		expect(connection.closed).toBe(1008);
		expect(observer.messages).toEqual([]);
	});

	it('bounds incoming frames and per-session connections', async () => {
		const runtime = await start({ maxPerSession: 1 });
		const connection = await connect(owner, projectId, runtime);
		await rejected(`/projects/${projectId}/events`, { Cookie: owner.cookies, Origin: ORIGIN }, 429, runtime);
		connection.ws.send('x'.repeat(2048));
		await until(() => connection.closed !== undefined, 'oversized frame rejected');
		expect(connection.closed).toBe(1009);
	});

	it('delivers changes to subscribers on two independent HTTP servers', async () => {
		const first = await start();
		const second = await start();
		const a = await connect(owner, projectId, first);
		const b = await connect(editor, projectId, second);
		await request(first.http).patch(`/projects/${projectId}/tasks/${taskId}/status`).set('Cookie', owner.cookies).send({ status: 'done' }).expect(200);
		await Promise.all([changed(a), changed(b)]);
		expect(a.messages).toEqual(b.messages);
	});

	it('sends ready first when a project changes while clients are connecting', async () => {
		const runtime = await start();
		const joining = [connect(owner, projectId, runtime), connect(editor, projectId, runtime)];
		await changeTitle();
		const subscribers = await Promise.all(joining); // connect asserts the first frame is ready.
		for (const subscriber of subscribers) subscriber.messages.length = 0;
		await changeTitle(projectId, 'After joining');
		await Promise.all(subscribers.map(changed));
	});

	it('disconnects on notification loss and serves new subscribers after reconnecting', async () => {
		const connection = await connect();
		const { rows } = await pool.query("SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'collabflow-realtime'");
		expect(rows).toHaveLength(1);
		await pool.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
		await until(() => connection.closed !== undefined, 'listener outage');
		expect(connection.closed).toBe(1013);
		await until(async () => {
			const listening = await pool.query(`SELECT 1 FROM pg_stat_activity
				WHERE datname = current_database() AND application_name = 'collabflow-realtime'
				AND pid <> $1 AND state = 'idle' AND query = 'LISTEN collabflow_session_revocations'`, [rows[0].pid]);
			return listening.rowCount === 1;
		}, 'listener reconnection');
		const recovered = await connect();
		await changeTitle();
		await changed(recovered);
	});
});
