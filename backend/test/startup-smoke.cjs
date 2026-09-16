const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:net');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const WebSocket = require('ws');
const { Client } = require('pg');
const setup = require('./global-setup.cjs');
const teardown = require('./global-teardown.cjs');

function start(env) {
	const child = spawn(process.execPath, [path.join(__dirname, '../dist/server.js')], {
		env, stdio: ['ignore', 'pipe', 'pipe'],
	});
	const state = { child, stdout: '', stderr: '', exited: false };
	const deadline = setTimeout(() => child.kill('SIGKILL'), 30_000);
	child.stdout.on('data', data => { state.stdout += data; });
	child.stderr.on('data', data => { state.stderr += data; });
	state.exit = new Promise((resolve, reject) => {
		child.once('error', error => { clearTimeout(deadline); reject(error); });
		child.once('exit', (code, signal) => { clearTimeout(deadline); state.exited = true; resolve({ code, signal }); });
	});
	return state;
}
async function stop(state) {
	if (!state || state.exited) return;
	state.child.kill('SIGTERM');
	const timeout = setTimeout(() => state.child.kill('SIGKILL'), 12_000);
	try { await state.exit; } finally { clearTimeout(timeout); }
}

(async () => {
	let running, ws;
	try {
		await setup();
		// Only the disposable setup above selects the database. Deployed settings
		// cannot redirect this test, even though the child runs production code.
		const reservation = createServer();
		await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
		const port = reservation.address().port;
		await new Promise(resolve => reservation.close(resolve));
		const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), TRUST_PROXY_HOPS: '0',
			FRONTEND_URL: 'https://browser.example.test', JWT_SECRET: randomBytes(32).toString('hex'),
			JWT_REFRESH_SECRET: randomBytes(32).toString('hex'), DATABASE_URL: '', DB_SSL_MODE: 'disable', DB_SSL_CA_FILE: '',
		};
		running = start(env);
		const url = `http://127.0.0.1:${port}`;
		const deadline = Date.now() + 15_000;
		while (true) {
			assert.ok(!running.exited, 'API exited before readiness');
			assert.ok(Date.now() < deadline, 'API never became ready on the configured PORT');
			const ready = await fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
			if (ready?.ok) { assert.deepEqual(await ready.json(), { status: 'ready' }); break; }
			await delay(50);
		}
		const user = { name: 'Startup Test', email: 'startup@test.example', password: 'test-password-123' };
		const post = (endpoint, body, cookie) => fetch(`${url}${endpoint}`, {
			method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
			body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
		});
		assert.equal((await post('/auth/register', user)).status, 201);
		const login = await post('/auth/login', user);
		assert.equal(login.status, 200);
		const cookies = login.headers.getSetCookie();
		assert.equal(cookies.length, 2);
		for (const cookie of cookies) {
			assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=None/);
		}
		const cookie = cookies.map(value => value.split(';')[0]).join('; ');
		const projectResponse = await post('/projects', { title: 'Production startup' }, cookie);
		assert.equal(projectResponse.status, 201);
		const { data: project } = await projectResponse.json();
		ws = new WebSocket(`ws://127.0.0.1:${port}/projects/${project.id}/events`, {
			headers: { Cookie: cookie, Origin: env.FRONTEND_URL }, handshakeTimeout: 5000,
		});
		const message = await new Promise((resolve, reject) => {
			ws.once('message', resolve); ws.once('error', reject);
			ws.once('close', () => reject(new Error('WebSocket closed before readiness')));
		});
		assert.equal(JSON.parse(message.toString()).type, 'project.ready');
		const closed = new Promise(resolve => ws.once('close', resolve));
		await stop(running); await closed;
		assert.deepEqual(await running.exit, { code: 0, signal: null });
		// Reproduce a missing hosted migration through the actual production entry
		// point, using only the disposable database selected by setup().
		const database = new Client({
			host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
			password: env.DB_PASSWORD, database: env.DB_DATABASE, ssl: false, connectionTimeoutMillis: 5000,
		});
		try {
			await database.connect();
			await database.query('ALTER TABLE activity_logs RENAME TO private_startup_fixture');
			try {
				running = start(env);
				assert.deepEqual(await running.exit, { code: 1, signal: null });
				assert.match(running.stderr, /API startup failed \[database\/42P01\]/);
				assert.match(running.stderr, /migrations 001 and 002/);
				for (const secret of [env.JWT_SECRET, env.JWT_REFRESH_SECRET, env.DB_DATABASE, 'private_startup_fixture']) {
					assert.ok(!running.stderr.includes(secret), 'Startup failure exposed private details');
				}
			} finally { await database.query('ALTER TABLE private_startup_fixture RENAME TO activity_logs'); }
		} finally { await database.end(); }
		running = start({ ...env, PORT: 'invalid' });
		assert.equal((await running.exit).code, 1);
		assert.match(running.stderr, /PORT must be/);
		assert.ok(!running.stderr.includes(env.JWT_SECRET));
		console.log('Production startup smoke passed: configured port, readiness, secure cookies, WebSocket auth, SIGTERM cleanup, safe missing-migration diagnostics, invalid configuration.');
	} finally {
		ws?.terminate();
		await stop(running);
		await teardown();
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
