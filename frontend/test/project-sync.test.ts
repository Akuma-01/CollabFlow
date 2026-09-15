import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../lib/api';
import { createProjectSync, projectSocketUrl } from '../lib/project-sync';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) {
	const deadline = Date.now() + 3000;
	while (!check()) { assert.ok(Date.now() < deadline, 'condition timed out'); await sleep(10); }
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}
class Peer {
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: ((event: { code: number }) => void) | null = null;
	onerror: (() => void) | null = null;
	closed = false;
	close() { this.closed = true; }
	message(type: string, projectId = 7) { this.onmessage?.({ data: JSON.stringify({ type, projectId }) }); }
}
function fixture(t: { after: (fn: () => void) => void }) {
	const state = { value: 1, reads: 0, read: async () => state.value };
	const snapshots: number[] = [], statuses: string[] = [], denied: number[] = [], peers: Peer[] = [];
	const sync = createProjectSync({
		projectId: 7, read: () => { state.reads++; return state.read(); },
		connect: () => { const peer = new Peer(); peers.push(peer); return peer as unknown as WebSocket; },
		onSnapshot: value => snapshots.push(value), onStatus: status => statuses.push(status),
		onDenied: code => denied.push(code), onPending: () => {},
	});
	t.after(sync.stop);
	return { state, snapshots, statuses, denied, peers, sync };
}

test('builds ws/wss URLs without putting credentials in query strings', () => {
	assert.equal(projectSocketUrl('https://api.test', '7'), 'wss://api.test/projects/7/events');
	assert.equal(projectSocketUrl('http://localhost:3000/', '7'), 'ws://localhost:3000/projects/7/events');
});

test('fetches again after room readiness and coalesces a burst of hints', async t => {
	const f = fixture(t); f.sync.start();
	await until(() => f.peers.length === 1);
	f.state.value = 2; f.peers[0].message('project.ready');
	await until(() => f.snapshots.at(-1) === 2);
	assert.equal(f.statuses.at(-1), 'live');
	const reads = f.state.reads;
	for (let i = 0; i < 50; i++) f.peers[0].message('project.changed');
	await until(() => f.state.reads > reads);
	await sleep(100);
	assert.equal(f.state.reads, reads + 1);
	// A wrong room or unrecognized message cannot trigger a refresh.
	f.peers[0].message('project.changed', 8); f.peers[0].message('other');
	await sleep(100); assert.equal(f.state.reads, reads + 1);
});

test('discards an in-flight snapshot invalidated by a newer hint', async t => {
	const f = fixture(t); f.sync.start(); await until(() => f.peers.length === 1);
	f.peers[0].message('project.ready'); await until(() => f.statuses.at(-1) === 'live');
	const delayed = deferred<number>(); f.state.read = () => delayed.promise;
	f.peers[0].message('project.changed'); await until(() => f.state.reads === 3);
	f.state.read = async () => 3; f.peers[0].message('project.changed'); delayed.resolve(2);
	await until(() => f.snapshots.at(-1) === 3); assert.ok(!f.snapshots.includes(2));
});

test('holds stale reads across concurrent writes, locks each task, then reconciles once', async t => {
	const f = fixture(t); f.sync.start(); await until(() => f.peers.length === 1);
	const delayed = deferred<number>(); f.state.read = () => delayed.promise;
	f.sync.refresh(); await until(() => f.state.reads === 2);
	const a = f.sync.beginMutation('task:1')!, b = f.sync.beginMutation('task:2')!;
	assert.equal(f.sync.beginMutation('task:1'), undefined);
	delayed.resolve(2); f.state.read = async () => 3;
	a(); a(); await sleep(120); assert.deepEqual(f.snapshots, [1]);
	b(); await until(() => f.snapshots.at(-1) === 3);
	assert.deepEqual(f.snapshots, [1, 3]); assert.equal(f.state.reads, 3);
});

test('reconnects through fresh HTTP state, and fetches again after rejoining', async t => {
	const f = fixture(t); f.sync.start(); await until(() => f.peers.length === 1);
	f.peers[0].message('project.ready'); await until(() => f.statuses.at(-1) === 'live');
	f.peers[0].onclose?.({ code: 4001 }); f.state.value = 2;
	assert.equal(f.statuses.at(-1), 'reconnecting');
	await until(() => f.peers.length === 2); assert.equal(f.snapshots.at(-1), 2);
	f.state.value = 3; f.peers[1].message('project.ready');
	await until(() => f.snapshots.at(-1) === 3); assert.equal(f.statuses.at(-1), 'live');
});

for (const code of [401, 403, 404]) test(`HTTP ${code} stops reconnects and clears access`, async t => {
	const f = fixture(t); f.state.read = async () => { throw new ApiError('denied', code); };
	f.sync.start(); await until(() => f.denied.length === 1);
	f.sync.refresh(); await sleep(100);
	assert.deepEqual(f.denied, [code]); assert.equal(f.peers.length, 0); assert.equal(f.state.reads, 1);
});

test('revocation discards a late snapshot and pending write completion', async t => {
	const f = fixture(t); f.sync.start(); await until(() => f.peers.length === 1);
	const delayed = deferred<number>(); f.state.read = () => delayed.promise;
	f.sync.refresh(); await until(() => f.state.reads === 2);
	const finish = f.sync.beginMutation('task:1')!;
	f.peers[0].onclose?.({ code: 4003 }); delayed.resolve(2); finish();
	await sleep(120); assert.deepEqual(f.snapshots, [1]); assert.deepEqual(f.denied, [403]);
	assert.equal(f.sync.beginMutation('task:2'), undefined);
});

test('HTTP failures retry without requiring another hint; disposal cancels recovery', async t => {
	const f = fixture(t); f.state.read = async () => { throw new Error('offline'); };
	f.sync.start(); await until(() => f.statuses.at(-1) === 'reconnecting');
	f.state.read = async () => 2; await until(() => f.snapshots.at(-1) === 2);
	f.peers[0].onclose?.({ code: 1013 }); f.sync.stop();
	await sleep(800); assert.equal(f.peers.length, 1);
});
