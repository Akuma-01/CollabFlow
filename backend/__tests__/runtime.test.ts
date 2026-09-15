import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import WebSocket from 'ws';
import pool from '../config/db';
import { createApp } from '../server';
import { startHttpServer } from '../runtime/server';
import { createProject, createUser, useTestDatabase } from '../test/helpers';

useTestDatabase();

async function until(check: () => Promise<boolean> | boolean) {
	const deadline = Date.now() + 4000;
	while (!await check()) {
		if (Date.now() > deadline) throw new Error('Timed out waiting for runtime state');
		await delay(10);
	}
}
const listeners = async () => (await pool.query(`SELECT pid FROM pg_stat_activity
	WHERE datname = current_database() AND application_name = 'collabflow-realtime'`)).rows as { pid: number }[];

describe('API startup, readiness, and shutdown', () => {
	let runtime: Awaited<ReturnType<typeof startHttpServer>> | undefined;
	afterEach(async () => { await runtime?.close(); runtime = undefined; jest.restoreAllMocks(); });
	const start = async (app = createApp()) => {
		runtime = await startHttpServer(app, { port: 0, host: '127.0.0.1', realtime: { reconnectDelayMs: 1000 } });
		return app;
	};

	it('is live but not ready until database/schema/listener startup succeeds', async () => {
		const app = createApp();
		await request(app).get('/health/live').expect(200, { status: 'ok' });
		await request(app).get('/health/ready').expect(503, { status: 'not_ready' });
		await start(app);
		const ready = await request(runtime!.server).get('/health/ready').expect(200, { status: 'ready' });
		expect(ready.headers['cache-control']).toBe('no-store');
		expect((await listeners()).length).toBe(1);
	});

	it('fails before listening when a required migration is absent', async () => {
		await pool.query('ALTER TABLE activity_logs RENAME TO activity_logs_runtime_fixture');
		try {
			await expect(start()).rejects.toMatchObject({ code: '42P01' });
			expect(await listeners()).toHaveLength(0);
		} finally { await pool.query('ALTER TABLE activity_logs_runtime_fixture RENAME TO activity_logs'); }
	});

	it('cleans up the notification connection when the HTTP port is occupied', async () => {
		const blocker = createServer();
		await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', resolve));
		try {
			await expect(startHttpServer(createApp(), { port: (blocker.address() as AddressInfo).port, host: '127.0.0.1' }))
				.rejects.toMatchObject({ code: 'EADDRINUSE' });
			await until(async () => (await listeners()).length === 0);
		} finally { await new Promise<void>(resolve => blocker.close(() => resolve())); }
	});

	it('loses readiness on a real listener disconnect and regains it after resubscribing', async () => {
		await start();
		const [listener] = await listeners();
		await pool.query('SELECT pg_terminate_backend($1)', [listener.pid]);
		await until(async () => (await request(runtime!.server).get('/health/ready')).status === 503);
		await request(runtime!.server).get('/health/live').expect(200);
		await until(async () => (await request(runtime!.server).get('/health/ready')).status === 200);
		expect((await listeners())[0].pid).not.toBe(listener.pid);
	});

	it('survives a failed idle pool connection and serves another probe', async () => {
		await start();
		const client = await pool.connect();
		const { rows: [{ pid }] } = await client.query('SELECT pg_backend_pid() AS pid');
		const killer = await pool.connect();
		const lost = new Promise(resolve => pool.once('error', resolve));
		const log = jest.spyOn(console, 'error').mockImplementation(() => {});
		client.release();
		try { await killer.query('SELECT pg_terminate_backend($1)', [pid]); await lost; }
		finally { killer.release(); }
		expect(log).toHaveBeenCalledWith('Idle PostgreSQL connection lost');
		await request(runtime!.server).get('/health/ready').expect(200);
	});

	it('returns a generic readiness failure when the database probe fails', async () => {
		await start();
		jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('private database address and credentials') as never);
		const response = await request(runtime!.server).get('/health/ready').expect(503);
		expect(response.body).toEqual({ status: 'not_ready' });
		await request(runtime!.server).get('/health/live').expect(200);
		await request(runtime!.server).get('/health/ready').expect(200);
	});

	it('shares concurrent probes and rechecks shutdown after an in-flight probe finishes', async () => {
		const app = await start();
		const ready = jest.fn(() => true);
		app.locals.health.realtimeReady = ready;
		let resolve!: (result: unknown) => void;
		const pending = new Promise(done => { resolve = done; });
		const query = jest.spyOn(pool, 'query').mockReturnValueOnce(pending as never);
		const first = request(runtime!.server).get('/health/ready').then(result => result);
		const second = request(runtime!.server).get('/health/ready').then(result => result);
		try {
			await until(() => ready.mock.calls.length >= 2);
			expect(query).toHaveBeenCalledTimes(1);
			app.locals.health.shuttingDown = true;
		} finally { resolve({ rows: [{ '?column?': 1 }] }); }
		for (const response of await Promise.all([first, second])) {
			expect(response.status).toBe(503);
			expect(response.body).toEqual({ status: 'not_ready' });
		}
	});

	it('closes WebSockets, rejects readiness, and lets an active HTTP response finish during shutdown', async () => {
		const owner = await createUser('RuntimeOwner');
		const projectId = await createProject(owner);
		const app = createApp();
		let release!: () => void, started!: () => void;
		const held = new Promise<void>(resolve => { release = resolve; });
		const began = new Promise<void>(resolve => { started = resolve; });
		app.get('/test-drain', async (_req, res) => { started(); await held; res.json({ finished: true }); });
		await start(app);
		const port = (runtime!.server.address() as AddressInfo).port;
		const ws = new WebSocket(`ws://127.0.0.1:${port}/projects/${projectId}/events`, {
			headers: { Cookie: owner.cookies, Origin: 'http://localhost:3001' },
		});
		try {
			await new Promise<void>((resolve, reject) => { ws.once('message', () => resolve()); ws.once('error', reject); });
			const closed = new Promise(resolve => ws.once('close', resolve));
			const response = request(runtime!.server).get('/test-drain').then(result => result);
			await began;
			const closing = runtime!.close();
			expect(runtime!.close()).toBe(closing);
			await closed;
			await request(app).get('/health/ready').expect(503);
			release();
			expect((await response).body).toEqual({ finished: true });
			await closing;
			expect(runtime!.server.listening).toBe(false);
			await until(async () => (await listeners()).length === 0);
		} finally { release(); ws.terminate(); }
	});
});
