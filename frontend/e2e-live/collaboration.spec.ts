import { expect, test, APIRequestContext, Page } from '@playwright/test';

const api = 'http://127.0.0.1:4319';
async function request<T>(client: APIRequestContext, method: string, path: string, data?: unknown): Promise<T> {
	const response = await client.fetch(`${api}${path}`, {
		method, data, headers: { Origin: 'http://127.0.0.1:3100' },
	});
	expect(response.ok(), `${method} ${path}: ${response.status()}`).toBe(true);
	return (await response.json()).data;
}
const live = (page: Page) => expect(page.getByRole('status', { name: 'Project synchronization' })).toHaveText('Live updates connected');

test('two browser sessions collaborate through real HTTP, WebSockets, and PostgreSQL', async ({ browser }) => {
	const owner = await browser.newContext(), editor = await browser.newContext();
	try {
		const password = 'Browser-test-password-123';
		await request(owner.request, 'POST', '/auth/register', { name: 'Alice', email: 'alice@browser.test', password });
		await request(editor.request, 'POST', '/auth/register', { name: 'Bob', email: 'bob@browser.test', password });
		await request(owner.request, 'POST', '/auth/login', { email: 'alice@browser.test', password });
		await request(editor.request, 'POST', '/auth/login', { email: 'bob@browser.test', password });
		const alice = await request<{ id: number }>(owner.request, 'GET', '/auth/me');
		const bob = await request<{ id: number }>(editor.request, 'GET', '/auth/me');
		const project = await request<{ id: number }>(owner.request, 'POST', '/projects', { title: 'Shared workspace' });
		const path = `/projects/${project.id}`;
		await request(owner.request, 'POST', `${path}/members`, { user_id: bob.id, role: 'editor' });
		const a = await owner.newPage(), b = await editor.newPage();
		const errors: string[] = [];
		for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
		await Promise.all([a.goto(`http://127.0.0.1:3100${path}`), b.goto(`http://127.0.0.1:3100${path}`)]);
		await Promise.all([live(a), live(b)]);
		await b.getByRole('button', { name: '+ Add task' }).click();
		await b.getByPlaceholder('Task title').fill('Bob’s unfinished draft');
		await a.getByRole('button', { name: '+ Add task' }).click();
		await a.getByPlaceholder('Task title').fill('Ship collaboration');
		await a.getByRole('button', { name: 'Create task', exact: true }).click();
		await expect(b.getByRole('region', { name: 'Todo tasks' })).toContainText('Ship collaboration');
		await expect(b.getByPlaceholder('Task title')).toHaveValue('Bob’s unfinished draft');
		await a.getByRole('button', { name: 'Activity', exact: true }).click();
		await expect(a.getByRole('list', { name: 'Project activity' })).toContainText('created task “Ship collaboration”');
		await b.getByRole('region', { name: 'Todo tasks' }).locator('[draggable=true]').dragTo(b.getByRole('region', { name: 'Done tasks' }));
		await expect(a.getByRole('list', { name: 'Project activity' })).toContainText('moved task “Ship collaboration”');
		await expect(a.getByText('1 Done', { exact: true })).toBeVisible();
		await expect(b.getByText('Saving…')).toHaveCount(0);
		await b.getByRole('region', { name: 'Done tasks' }).getByRole('button', { name: 'Unassigned' }).click();
		await b.getByLabel('Assign Ship collaboration').selectOption(String(alice.id));
		await expect(a.getByRole('list', { name: 'Project activity' })).toContainText('assigned task “Ship collaboration” to Alice');
		await request(owner.request, 'PATCH', path, { title: 'Renamed workspace' });
		await expect(b.getByRole('heading', { name: 'Renamed workspace' })).toBeVisible();
		await request(owner.request, 'PATCH', `${path}/members/${bob.id}`, { role: 'viewer' });
		await expect(b.getByRole('button', { name: '+ Add task' })).toHaveCount(0);
		await expect(b.getByRole('region', { name: 'Done tasks' }).locator('[draggable=true]')).toHaveCount(0);
		await request(owner.request, 'DELETE', `${path}/members/${bob.id}`);
		await expect(b.getByRole('alert').filter({ hasText: 'no longer available' })).toBeVisible();
		await expect(b.getByRole('heading', { name: 'Renamed workspace' })).toHaveCount(0);
		// Logout revokes the live socket for this login without a page reload.
		await request(owner.request, 'POST', '/auth/logout');
		await expect(a.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
		await expect(a.getByRole('list', { name: 'Project activity' })).toHaveCount(0);
		expect(errors).toEqual([]);
	} finally { await owner.close(); await editor.close(); }
});
