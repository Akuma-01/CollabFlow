import { expect, Page, test } from '@playwright/test';
import { ActivityRecord } from '../lib/activity';
import { Task, ProjectRole } from '../lib/types';

const event = (action = 'PROJECT_CREATED', metadata: Record<string, unknown> = { title: 'Demo' }, id = '1'): ActivityRecord => ({
	id, project_id: 7, actor_id: null, actor_name: 'Alice', action,
	entity_type: 'project', entity_id: 7, metadata, created_at: '2026-09-14T09:30:00.000Z',
});
type Reply = { status?: number; data: ActivityRecord[]; nextCursor: string | null };
const reply = (data: ActivityRecord[], nextCursor: string | null = null): Reply => ({ data, nextCursor });
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}

// These tests exercise the real production UI and API client with controlled
// HTTP responses. PostgreSQL authorization/transactions have separate API tests.
async function project(page: Page, role: ProjectRole = 'owner') {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	const member = { id: 3, name: 'Alice', email: 'alice@test.com', role };
	const members = [member];
	const tasks: Task[] = [];
	await page.routeWebSocket('ws://127.0.0.1:4319/projects/7/events', socket => {
		socket.send(JSON.stringify({ type: 'project.ready', projectId: 7 }));
	});
	const state = {
		activity: (async () => reply([event()])) as (url: URL) => Promise<Reply>,
		requests: [] as URL[],
		status: 200,
		created: false,
	};
	await page.route('http://127.0.0.1:4319/**', async route => {
		const url = new URL(route.request().url());
		const path = url.pathname;
		if (path === '/projects/7/activity') {
			state.requests.push(url);
			const result = await state.activity(url);
			await route.fulfill({ status: result.status ?? 200, json: { success: !result.status || result.status === 200, ...result } });
			return;
		}
		if (path.startsWith('/auth/')) {
			await route.fulfill({ status: state.status, json: { data: member } });
			return;
		}
		let data: unknown;
		if (path === '/projects/7') data = { id: 7, title: 'Demo', owner_id: role === 'owner' ? 3 : 1, member_count: members.length };
		else if (path === '/projects/7/members') {
			if (route.request().method() === 'POST') members.push({ id: 4, name: 'Bob', email: 'bob@test.com', role: 'editor' });
			data = members;
		} else if (path === '/projects/7/tasks') {
			if (route.request().method() === 'POST') {
				state.created = true;
				data = { ...route.request().postDataJSON(), id: 8, project_id: 7, status: 'todo', assigned_to: null };
				tasks.push(data as Task);
			} else data = tasks;
		} else if (path === '/users/search') data = [{ id: 4, name: 'Bob', email: 'bob@test.com' }];
		else throw new Error(`Unexpected API request: ${route.request().method()} ${path}`);
		await route.fulfill({ json: { success: true, data } });
	});
	await page.goto('/projects/7');
	await expect(page.getByRole('heading', { name: 'Demo' })).toBeVisible();
	await expect(page.getByRole('status', { name: 'Project synchronization' })).toHaveText('Live updates connected');
	return { state, errors };
}
const openActivity = (page: Page) => page.getByRole('button', { name: 'Activity', exact: true }).click();
const items = (page: Page) => page.getByRole('list', { name: 'Project activity' }).getByRole('listitem');
const alert = (page: Page) => page.getByRole('region', { name: 'Activity', exact: true }).getByRole('alert');

for (const role of ['owner', 'editor', 'viewer', 'guide'] as const) {
	test(`${role} can open history with a saved actor name after actor deletion`, async ({ page }) => {
		const { state, errors } = await project(page, role);
		expect(state.requests).toHaveLength(0);
		await openActivity(page);
		await expect(items(page)).toContainText(['Alice created project “Demo”']);
		await expect(page.getByRole('button', { name: 'Activity', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect(items(page).locator('time')).toHaveAttribute('datetime', '2026-09-14T09:30:00.000Z');
		expect(errors).toEqual([]);
	});
}

test('renders all event types, full field changes, automatic reasons, and unknown events safely', async ({ page }, testInfo) => {
	const { state, errors } = await project(page);
	const member = { id: 5, name: 'Removed member' };
	const unsafeText = '<img src=x onerror="window.injected=true">';
	state.activity = async () => reply([
		event('PROJECT_CREATED', { title: 'Old' }, '12'),
		event('PROJECT_UPDATED', { from: { title: 'Old' }, to: { title: 'New' } }, '11'),
		event('TASK_CREATED', { title: 'API', status: 'todo', assignee: member, deadline: '2026-12-31' }, '10'),
		event('TASK_UPDATED', { title: 'API', changes: { description: { from: null, to: unsafeText }, deadline: { from: '2026-12-31', to: '2027-01-01' } } }, '9'),
		event('TASK_MOVED', { title: 'API', from: 'todo', to: 'in_progress' }, '8'),
		event('TASK_ASSIGNED', { title: 'API', from: null, to: member }, '7'),
		event('TASK_ASSIGNED', { title: 'API', from: member, to: null, reason: 'member_removed' }, '6'),
		event('TASK_ASSIGNED', { title: 'API', from: member, to: null, reason: 'role_changed' }, '5'),
		event('TASK_DELETED', { title: 'Deleted task', status: 'done' }, '4'),
		event('MEMBER_ADDED', { member, role: 'editor' }, '3'),
		event('MEMBER_REMOVED', { member, role: 'guide' }, '2'),
		event('ROLE_CHANGED', { member, from: 'viewer', to: 'guide' }, '1'),
		event('FUTURE_EVENT', {}, '0'),
	]);
	await openActivity(page);
	await expect(items(page)).toHaveCount(13);
	await expect(items(page).nth(1)).toContainText('Old');
	await expect(items(page).nth(1)).toContainText('New');
	await expect(items(page).nth(2)).toContainText('2026-12-31');
	await items(page).nth(3).getByText('View changes', { exact: true }).click();
	await expect(items(page).nth(3)).toContainText(unsafeText);
	await expect(items(page).nth(3)).toContainText('2027-01-01');
	await expect(items(page).nth(4)).toContainText('In Progress');
	await expect(items(page).nth(5)).toContainText('assigned task “API” to Removed member');
	await expect(items(page).nth(6)).toContainText('because the member was removed');
	await expect(items(page).nth(7)).toContainText('because the member became a guide');
	await expect(items(page).nth(8)).toContainText('deleted task “Deleted task”');
	await expect(items(page).nth(9)).toContainText('added Removed member as Editor');
	await expect(items(page).nth(10)).toContainText('removed Removed member from the project');
	await expect(items(page).nth(11)).toContainText('Viewer');
	await expect(items(page).nth(11)).toContainText('Guide');
	await expect(items(page).nth(12)).toContainText('Details for this activity are unavailable');
	await expect(page.locator('img')).toHaveCount(0);
	expect(errors).toEqual([]);
	await page.screenshot({ path: testInfo.outputPath('activity-desktop.png'), fullPage: true });
});

test('paginates with exact bigint cursors, deduplicates rows, and resets pagination for filters', async ({ page }) => {
	const { state } = await project(page);
	const cursor = '9007199254740993';
	const first = event('PROJECT_CREATED', { title: 'Newest' }, cursor);
	state.activity = async url => url.searchParams.has('action')
		? reply([event('TASK_DELETED', { title: 'Deleted', status: 'done' })])
		: url.searchParams.has('before') ? reply([first, event('PROJECT_CREATED', { title: 'Older' }, '9007199254740992')]) : reply([first], cursor);
	await openActivity(page);
	await expect(items(page)).toHaveCount(1);
	await page.getByRole('button', { name: 'Load older activity' }).click();
	await expect(items(page)).toContainText(['Newest', 'Older']);
	expect(state.requests[1].searchParams.get('before')).toBe(cursor);
	await expect(page.getByRole('button', { name: 'Load older activity' })).toHaveCount(0);
	await page.getByLabel('Activity type').selectOption('TASK_DELETED');
	await expect(items(page)).toContainText(['Deleted']);
	await expect(items(page)).toHaveCount(1);
	expect(state.requests.at(-1)?.searchParams.get('action')).toBe('TASK_DELETED');
	expect(state.requests.at(-1)?.searchParams.has('before')).toBe(false);
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect(items(page)).toHaveCount(1);
	expect(state.requests.at(-1)?.searchParams.get('action')).toBe('TASK_DELETED');
});

test('recovers from initial failure and distinguishes empty history from empty filtering', async ({ page }) => {
	const { state } = await project(page);
	state.activity = async () => ({ ...reply([]), status: 500 });
	await openActivity(page);
	await expect(alert(page)).toContainText('Could not load activity');
	state.activity = async () => reply([]);
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByRole('region', { name: 'Activity', exact: true }).getByRole('status')).toContainText('No activity yet');
	await page.getByLabel('Activity type').selectOption('TASK_MOVED');
	await expect(page.getByRole('region', { name: 'Activity', exact: true }).getByRole('status')).toContainText('No activity matches this filter');
});

test('preserves loaded rows and the same cursor when an older page fails and is retried', async ({ page }) => {
	const { state } = await project(page);
	let fail = true;
	state.activity = async url => url.searchParams.has('before')
		? fail ? { ...reply([]), status: 503 } : reply([event('PROJECT_CREATED', { title: 'Older' }, '1')])
		: reply([event('PROJECT_CREATED', { title: 'Newest' }, '2')], '2');
	await openActivity(page);
	await page.getByRole('button', { name: 'Load older activity' }).click();
	await expect(alert(page)).toBeVisible();
	await expect(items(page)).toContainText(['Newest']);
	fail = false;
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(items(page)).toContainText(['Newest', 'Older']);
	expect(state.requests.slice(1).map(url => url.searchParams.get('before'))).toEqual(['2', '2']);
});

for (const operation of ['filter', 'refresh'] as const) {
	test(`ignores a delayed older page after ${operation}`, async ({ page }) => {
		const { state } = await project(page);
		const delayed = deferred<Reply>();
		state.activity = async url => url.searchParams.has('before') ? delayed.promise
			: reply([event('PROJECT_CREATED', { title: 'Initial' }, '2')], '2');
		await openActivity(page);
		await page.getByRole('button', { name: 'Load older activity' }).click();
		await expect.poll(() => state.requests.length).toBe(2);
		await expect(page.getByRole('button', { name: 'Load older activity' })).toBeDisabled();
		state.activity = async () => reply([event('TASK_DELETED', { title: 'Current result', status: 'done' }, '3')]);
		if (operation === 'filter') await page.getByLabel('Activity type').selectOption('TASK_DELETED');
		else await page.getByRole('button', { name: 'Refresh', exact: true }).click();
		await expect(items(page)).toContainText(['Current result']);
		const finished = page.waitForEvent('requestfinished', req => req.url().includes('before=2'));
		delayed.resolve(reply([event('PROJECT_CREATED', { title: 'Stale result' })]));
		await finished;
		await page.evaluate(() => new Promise(requestAnimationFrame));
		await expect(items(page)).toHaveCount(1);
		await expect(items(page)).toContainText(['Current result']);
	});
}

test('ignores a delayed initial page after changing the filter', async ({ page }) => {
	const { state } = await project(page);
	const delayed = deferred<Reply>();
	state.activity = async url => url.searchParams.has('action')
		? reply([event('TASK_DELETED', { title: 'Filtered result', status: 'done' })]) : delayed.promise;
	await openActivity(page);
	await expect(page.getByRole('region', { name: 'Activity', exact: true }).getByRole('status')).toContainText('Loading activity');
	await expect.poll(() => state.requests.length).toBe(1);
	await page.getByLabel('Activity type').selectOption('TASK_DELETED');
	await expect(items(page)).toContainText(['Filtered result']);
	const finished = page.waitForEvent('requestfinished', req => req.url().endsWith('/activity?limit=20'));
	delayed.resolve(reply([event('PROJECT_CREATED', { title: 'Stale initial result' })]));
	await finished;
	await page.evaluate(() => new Promise(requestAnimationFrame));
	await expect(items(page)).toHaveCount(1);
	await expect(items(page)).toContainText(['Filtered result']);
});

for (const status of [401, 403, 404]) {
	test(`clears previously loaded history when pagination returns ${status}`, async ({ page }) => {
		const { state } = await project(page);
		state.activity = async url => url.searchParams.has('before') ? { ...reply([]), status }
			: reply([event('PROJECT_CREATED', { title: 'Private history' }, '2')], '2');
		await openActivity(page);
		await expect(items(page)).toHaveCount(1);
		state.status = status === 401 ? 401 : 200;
		await page.getByRole('button', { name: 'Load older activity' }).click();
		await expect(alert(page)).toBeVisible();
		await expect(page.getByRole('list', { name: 'Project activity' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: status === 401 ? 'Sign in' : 'Back to Dashboard', exact: true })).toBeVisible();
	});
}

test('loads new board mutations on entry and keeps unfinished task input when switching views', async ({ page }) => {
	const { state } = await project(page);
	state.activity = async () => reply(state.created ? [event('TASK_CREATED', { title: 'New task', status: 'todo', assignee: null })] : []);
	await page.getByRole('button', { name: '+ Add task' }).click();
	await page.getByPlaceholder('Task title').fill('New task');
	await openActivity(page);
	await expect(page.getByRole('region', { name: 'Activity', exact: true }).getByRole('status')).toContainText('No activity yet');
	await page.getByRole('button', { name: 'Board', exact: true }).click();
	await expect(page.getByPlaceholder('Task title')).toHaveValue('New task');
	await page.getByRole('button', { name: 'Create task', exact: true }).click();
	await expect(page.getByText('New task', { exact: true })).toBeVisible();
	await openActivity(page);
	await expect(items(page)).toContainText(['created task “New task”']);
});

test('refreshes an open filtered feed after adding a member and updates the member count', async ({ page }) => {
	const { state } = await project(page);
	let added = false;
	state.activity = async () => reply(added ? [event('MEMBER_ADDED', { member: { id: 4, name: 'Bob' }, role: 'editor' })] : []);
	await openActivity(page);
	await page.getByLabel('Activity type').selectOption('MEMBER_ADDED');
	await expect(page.getByRole('region', { name: 'Activity', exact: true }).getByRole('status')).toContainText('No activity matches');
	await page.getByRole('button', { name: '+ Add', exact: true }).click();
	await page.getByPlaceholder('Search by name or email…').fill('Bob');
	await page.getByText('Bob', { exact: true }).click();
	await page.locator('aside select').selectOption('editor');
	added = true;
	await page.getByRole('button', { name: 'Add member', exact: true }).click();
	await expect(items(page)).toContainText(['added Bob as Editor']);
	await expect(page.getByLabel('Activity type')).toHaveValue('MEMBER_ADDED');
	await expect(page.getByText(/2 Members$/)).toBeVisible();
});

test('fits a narrow viewport and supports keyboard view selection', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await project(page);
	await page.getByRole('button', { name: 'Activity', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(items(page)).toBeVisible();
	await expect(page.getByLabel('Activity type')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.screenshot({ path: testInfo.outputPath('activity-mobile.png'), fullPage: true });
});
