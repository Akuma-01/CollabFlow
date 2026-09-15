import { expect, Page, test, WebSocketRoute } from '@playwright/test';
import { Member, Task } from '../lib/types';

const apiOrigin = 'http://127.0.0.1:4319';
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}
const task = (id: number, title: string): Task => ({
	id, title, project_id: 7, description: null, status: 'todo', deadline: null,
	assigned_to: null, assigned_to_name: null, assigned_to_email: null,
});
async function fixture(page: Page) {
	const sockets: WebSocketRoute[] = [], errors: string[] = [];
	const state = {
		title: 'Live project', tasks: [task(8, 'First task')],
		members: [{ id: 3, name: 'Alice', email: 'alice@test.com', role: 'editor' }] as Member[],
		projectStatus: 200, authStatus: 200, refreshStatus: 200, refreshes: 0, reads: 0,
		beforeRead: async () => {}, beforeWrite: async () => {}, writeStatus: 200,
		history: 'Initial history', connectionsReady: true,
	};
	page.on('pageerror', error => errors.push(error.message));
	await page.routeWebSocket('ws://127.0.0.1:4319/projects/7/events', socket => {
		sockets.push(socket);
		if (state.connectionsReady) socket.send(JSON.stringify({ type: 'project.ready', projectId: 7 }));
	});
	await page.route(`${apiOrigin}/**`, async route => {
		const url = new URL(route.request().url()), method = route.request().method();
		let status = 200, data: unknown;
		if (url.pathname.startsWith('/auth/')) {
			if (url.pathname === '/auth/refresh') {
				state.refreshes++; status = state.refreshStatus;
				if (status === 200) state.authStatus = 200;
			} else status = state.authStatus;
			data = state.members[0];
		} else if (url.pathname === '/projects/7') {
			status = state.projectStatus; data = { id: 7, title: state.title, owner_id: 1 };
		} else if (url.pathname === '/projects/7/members') data = state.members;
		else if (url.pathname === '/projects/7/tasks' && method === 'GET') {
			state.reads++; data = structuredClone(state.tasks); await state.beforeRead();
		} else if (url.pathname === '/projects/7/tasks/8/status') {
			const updated = { ...state.tasks[0], status: route.request().postDataJSON().status };
			await state.beforeWrite(); status = state.writeStatus;
			if (status === 200) state.tasks[0] = updated;
			data = updated;
		} else if (url.pathname === '/projects/7/activity') {
			const older = url.searchParams.has('before');
			await route.fulfill({ json: {
				data: [{ id: older ? '1' : '2', project_id: 7, actor_id: 3, actor_name: 'Alice',
					action: 'PROJECT_CREATED', entity_type: 'project', entity_id: 7,
					metadata: { title: older ? 'Older history' : state.history }, created_at: '2026-09-15T10:00:00Z' }],
				nextCursor: older ? null : '2',
			} }); return;
		} else throw new Error(`Unexpected ${method} ${url.pathname}`);
		await route.fulfill({ status, json: { data, message: status === 200 ? undefined : 'Request failed' } });
	});
	await page.goto('/projects/7');
	await expect(page.getByRole('status', { name: 'Project synchronization' })).toHaveText('Live updates connected');
	const changed = () => sockets.at(-1)!.send(JSON.stringify({ type: 'project.changed', projectId: 7 }));
	return { state, sockets, changed, errors };
}
const column = (page: Page, name: string) => page.getByRole('region', { name: `${name} tasks`, exact: true });
const history = (page: Page) => page.getByRole('list', { name: 'Project activity' });

test('remote changes update board, title, team, and open activity while preserving input', async ({ page }) => {
	const f = await fixture(page);
	await page.getByRole('button', { name: '+ Add task' }).click();
	await page.getByPlaceholder('Task title').fill('Unfinished draft');
	f.state.title = 'Renamed remotely'; f.state.tasks.push(task(9, 'Remote task'));
	f.state.members.push({ id: 4, name: 'Bob', email: 'bob@test.com', role: 'viewer' }); f.changed();
	await expect(page.getByRole('heading', { name: 'Renamed remotely' })).toBeVisible();
	await expect(column(page, 'Todo')).toContainText('Remote task');
	await expect(page.getByText(/2 Members$/)).toBeVisible();
	await expect(page.getByPlaceholder('Task title')).toHaveValue('Unfinished draft');
	await page.getByRole('button', { name: 'Activity', exact: true }).click();
	await expect(history(page)).toContainText('Initial history');
	f.state.history = 'Remote history'; f.changed();
	await expect(history(page)).toContainText('Remote history');
	await page.getByRole('button', { name: 'Board', exact: true }).click();
	await expect(page.getByPlaceholder('Task title')).toHaveValue('Unfinished draft');
	f.state.members[0].role = 'viewer'; f.changed();
	await expect(page.getByRole('button', { name: '+ Add task' })).toHaveCount(0);
	await expect(page.getByPlaceholder('Task title')).toHaveCount(0);
	await expect(column(page, 'Todo').locator('[draggable=true]')).toHaveCount(0);
	expect(f.errors).toEqual([]);
});

test('new changes preserve older activity and the filter until latest activity is requested', async ({ page }) => {
	const f = await fixture(page);
	await page.getByRole('button', { name: 'Activity', exact: true }).click();
	await page.getByLabel('Activity type').selectOption('PROJECT_CREATED');
	await page.getByRole('button', { name: 'Load older activity' }).click();
	await expect(history(page)).toContainText('Older history');
	f.state.history = 'Latest history'; f.changed();
	await expect(page.getByRole('button', { name: 'Show latest activity' })).toBeVisible();
	await expect(history(page)).toContainText('Older history');
	await expect(history(page)).not.toContainText('Latest history');
	await page.getByRole('button', { name: 'Show latest activity' }).click();
	await expect(history(page)).toContainText('Latest history');
	await expect(history(page)).not.toContainText('Older history');
	await expect(page.getByLabel('Activity type')).toHaveValue('PROJECT_CREATED');
});

for (const succeeds of [true, false]) test(`delayed reads cannot undo a pending drag; reconciles ${succeeds ? 'success' : 'failure'}`, async ({ page }) => {
	const f = await fixture(page), read = deferred(), write = deferred();
	f.state.beforeRead = () => read.promise;
	const reads = f.state.reads; f.changed(); await expect.poll(() => f.state.reads).toBe(reads + 1);
	f.state.beforeWrite = () => write.promise; f.state.writeStatus = succeeds ? 200 : 409;
	await column(page, 'Todo').locator('[draggable=true]').dragTo(column(page, 'Done'));
	await expect(column(page, 'Done')).toContainText('Saving…');
	await expect(column(page, 'Done').locator('[draggable=true]')).toHaveCount(0);
	const readFinished = page.waitForEvent('requestfinished', request => request.url().endsWith('/tasks'));
	read.resolve(); await readFinished;
	await expect(column(page, 'Done')).toContainText('First task');
	f.state.beforeRead = async () => {}; f.state.tasks.push(task(9, 'Concurrent task')); f.changed();
	write.resolve();
	await expect(column(page, succeeds ? 'Done' : 'Todo')).toContainText('First task');
	await expect(column(page, 'Todo')).toContainText('Concurrent task');
	await expect(page.getByText('Saving…')).toHaveCount(0);
	if (!succeeds) await expect(page.getByRole('alert').filter({ hasText: 'Request failed' })).toBeVisible();
});

test('expired access restores the session before reconnecting and fetches missed changes', async ({ page }) => {
	const f = await fixture(page);
	f.state.authStatus = 401; f.state.tasks.push(task(9, 'Missed task'));
	f.sockets[0].close({ code: 4001, reason: 'Access token expired' });
	await expect.poll(() => f.state.refreshes).toBe(1);
	await expect.poll(() => f.sockets.length).toBe(2);
	await expect(page.getByRole('status', { name: 'Project synchronization' })).toHaveText('Live updates connected');
	await expect(column(page, 'Todo')).toContainText('Missed task');
});

for (const failure of ['session', 'membership', 'failed upgrade'] as const) test(`${failure} loss clears private project content`, async ({ page }) => {
	const f = await fixture(page);
	await page.getByRole('button', { name: 'Activity', exact: true }).click();
	await expect(history(page)).toContainText('Initial history');
	if (failure === 'session') { f.state.authStatus = 401; f.state.refreshStatus = 401; }
	if (failure === 'failed upgrade') f.state.projectStatus = 404;
	f.sockets[0].close({ code: failure === 'membership' ? 4003 : failure === 'session' ? 4001 : 1013 });
	await expect(page.getByRole('heading', { name: 'Live project' })).toHaveCount(0);
	await expect(history(page)).toHaveCount(0);
	await expect(page.getByRole('link', { name: failure === 'session' ? 'Sign in' : '← Back to Dashboard', exact: true })).toBeVisible();
	expect(f.sockets).toHaveLength(1);
});

test('temporary read failure recovers without a new event or page reload', async ({ page }) => {
	const f = await fixture(page); f.state.projectStatus = 503; f.changed();
	await expect(page.getByRole('status', { name: 'Project synchronization' })).toContainText('Reconnecting');
	f.state.projectStatus = 200; f.state.tasks.push(task(9, 'Recovered task'));
	await page.getByRole('button', { name: 'Retry now' }).click();
	await expect(column(page, 'Todo')).toContainText('Recovered task');
	await expect(page.getByRole('status', { name: 'Project synchronization' })).toHaveText('Live updates connected');
});
