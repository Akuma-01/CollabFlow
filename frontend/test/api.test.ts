import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createApiClient } from '../lib/api';

const BASE_URL = 'https://api.example.test';
const response = (status = 200) => new Response(JSON.stringify({ success: status === 200 }), { status });

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}

function sessionServer() {
	let authenticated = false;
	let refreshStatus = 200;
	const calls: { path: string; options?: RequestInit }[] = [];
	const fetcher: typeof fetch = async (input, options) => {
		const path = new URL(String(input)).pathname;
		calls.push({ path, options });
		if (path === '/auth/refresh') {
			if (refreshStatus === 200) authenticated = true;
			return response(refreshStatus);
		}
		if (path === '/auth/logout') { authenticated = false; return response(); }
		return response(authenticated ? 200 : 401);
	};
	return {
		fetcher, calls,
		setRefreshStatus: (status: number) => { refreshStatus = status; },
		isAuthenticated: () => authenticated,
	};
}

function sharedLocks() {
	let queue: Promise<unknown> = Promise.resolve();
	return {
		request<T>(_name: string, operation: () => Promise<T>): Promise<T> {
			const result = queue.then(operation, operation);
			queue = result.catch(() => {});
			return result;
		},
	};
}

test('parallel requests share one refresh and preserve credentials', async () => {
	const server = sessionServer();
	const started = deferred<void>();
	const release = deferred<void>();
	const client = createApiClient(BASE_URL, async (input, options) => {
		if (String(input).endsWith('/auth/refresh')) { started.resolve(); await release.promise; }
		return server.fetcher(input, options);
	});
	const requests = [client.get('/projects'), client.get('/dashboard'), client.get('/auth/me')];
	await started.promise;
	release.resolve();
	await Promise.all(requests);
	assert.equal(server.calls.filter(call => call.path === '/auth/refresh').length, 1);
	assert.ok(server.calls.every(call => call.options?.credentials === 'include'));
});

test('a delayed 401 rechecks the current session instead of rotating again', async () => {
	const server = sessionServer();
	const delayed = deferred<Response>();
	let slowCalls = 0;
	const client = createApiClient(BASE_URL, async (input, options) => {
		if (String(input).endsWith('/slow') && slowCalls++ === 0) return delayed.promise;
		return server.fetcher(input, options);
	});
	const slow = client.get('/slow');
	await client.get('/fast');
	delayed.resolve(response(401));
	await slow;
	assert.equal(server.calls.filter(call => call.path === '/auth/refresh').length, 1);
});

test('independent tabs coordinate refresh through the shared Web Lock', async () => {
	const server = sessionServer();
	const locks = sharedLocks();
	const first = createApiClient(BASE_URL, server.fetcher, locks);
	const second = createApiClient(BASE_URL, server.fetcher, locks);
	await Promise.all([first.get('/projects'), second.get('/dashboard')]);
	assert.equal(server.calls.filter(call => call.path === '/auth/refresh').length, 1);
});

for (const crossTab of [false, true]) {
	test(`logout waits for cookie-changing refresh ${crossTab ? 'across tabs' : 'without Web Locks'}`, async () => {
		const server = sessionServer();
		const started = deferred<void>();
		const release = deferred<void>();
		const fetcher: typeof fetch = async (input, options) => {
			if (String(input).endsWith('/auth/refresh')) { started.resolve(); await release.promise; }
			return server.fetcher(input, options);
		};
		const locks = crossTab ? sharedLocks() : undefined;
		const client = createApiClient(BASE_URL, fetcher, locks);
		const other = crossTab ? createApiClient(BASE_URL, fetcher, locks) : client;
		const pending = client.get('/projects');
		const settled = Promise.allSettled([pending]);
		await started.promise;
		const logout = other.post('/auth/logout');
		assert.equal(server.calls.filter(call => call.path === '/auth/logout').length, 0);
		release.resolve();
		await logout;
		await settled;
		assert.deepEqual(server.calls.filter(call => ['/auth/refresh', '/auth/logout'].includes(call.path)).map(call => call.path),
			['/auth/refresh', '/auth/logout']);
		assert.equal(server.isAuthenticated(), false);
	});
}

test('failed refresh rejects all waiting callers without repeated refresh requests', async () => {
	const server = sessionServer();
	server.setRefreshStatus(401);
	const client = createApiClient(BASE_URL, server.fetcher);
	const results = await Promise.allSettled([client.get('/projects'), client.get('/dashboard')]);
	assert.ok(results.every(result => result.status === 'rejected' && result.reason instanceof ApiError && result.reason.status === 401));
	assert.equal(server.calls.filter(call => call.path === '/auth/refresh').length, 1);
});

test('server failures preserve their status and a later request can recover', async () => {
	const server = sessionServer();
	server.setRefreshStatus(503);
	const client = createApiClient(BASE_URL, server.fetcher);
	await assert.rejects(client.get('/projects'), error => error instanceof ApiError && error.status === 503);
	server.setRefreshStatus(200);
	await client.get('/projects');
	assert.equal(server.calls.filter(call => call.path === '/auth/refresh').length, 2);
});

test('network failure releases the refresh promise and lock for a later retry', async () => {
	const server = sessionServer();
	let fail = true;
	const client = createApiClient(BASE_URL, async (input, options) => {
		if (fail && String(input).endsWith('/auth/refresh')) throw new Error('Network unavailable');
		return server.fetcher(input, options);
	});
	await assert.rejects(client.get('/projects'), /Network unavailable/);
	fail = false;
	await client.get('/projects');
});

test('does not loop if the original request remains unauthorized after refreshing', async () => {
	let refreshes = 0;
	let originals = 0;
	const client = createApiClient(BASE_URL, async input => {
		if (String(input).endsWith('/auth/refresh')) { refreshes++; return response(); }
		if (String(input).endsWith('/projects')) originals++;
		return response(401);
	});
	await assert.rejects(client.get('/projects'), error => error instanceof ApiError && error.status === 401);
	assert.equal(refreshes, 1);
	assert.equal(originals, 2);
});

test('login and logout errors do not trigger automatic refresh', async () => {
	const calls: string[] = [];
	const client = createApiClient(BASE_URL, async input => {
		calls.push(String(input));
		return response(String(input).endsWith('/auth/logout') ? 500 : 401);
	});
	await assert.rejects(client.post('/auth/login', { email: 'alice@test.com', password: 'bad' }),
		error => error instanceof ApiError && error.status === 401);
	await assert.rejects(client.post('/auth/logout'), error => error instanceof ApiError && error.status === 500);
	assert.equal(calls.length, 2);
});

test('retries a mutation once with the original method, JSON body, and headers', async () => {
	const server = sessionServer();
	const client = createApiClient(BASE_URL, server.fetcher);
	await client.patch('/projects/1/tasks/2', { title: 'Updated' });
	const attempts = server.calls.filter(call => call.path === '/projects/1/tasks/2');
	assert.equal(attempts.length, 2);
	assert.deepEqual(attempts[0].options, attempts[1].options);
	assert.equal(attempts[1].options?.method, 'PATCH');
	assert.equal(attempts[1].options?.body, JSON.stringify({ title: 'Updated' }));
	assert.deepEqual(attempts[1].options?.headers, { 'Content-Type': 'application/json' });
});

test('aborting a read during refresh does not cancel shared rotation or retry the disposed read', async () => {
	const server = sessionServer(), started = deferred<void>(), release = deferred<void>();
	const client = createApiClient(BASE_URL, async (input, options) => {
		if (String(input).endsWith('/auth/refresh')) { started.resolve(); await release.promise; }
		return server.fetcher(input, options);
	});
	const controller = new AbortController();
	const disposed = client.get('/disposed', controller.signal);
	const other = client.get('/other');
	await started.promise;
	const rejected = assert.rejects(disposed, error => error instanceof Error && error.name === 'AbortError');
	controller.abort(); await rejected;
	release.resolve(); await other;
	assert.equal(server.calls.filter(call => call.path === '/disposed').length, 1);
	assert.equal(server.calls.filter(call => call.path === '/auth/refresh').length, 1);
	assert.equal(server.calls.find(call => call.path === '/disposed')?.options?.signal, controller.signal);
});
