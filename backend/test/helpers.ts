import request from 'supertest';
import pool from '../config/db';
import app from '../server';

export interface TestUser {
	id: number;
	cookies: string;
}

export function useTestDatabase(): void {
	beforeEach(async () => {
		await pool.query('TRUNCATE auth_sessions, project_members, tasks, projects, users RESTART IDENTITY');
	});
	afterAll(async () => {
		await pool.end();
	});
}

export function parseCookies(res: request.Response): string {
	return ([] as string[])
		.concat(res.headers['set-cookie'] ?? [])
		.map(cookie => cookie.split(';')[0])
		.join('; ');
}

export function cookieValue(res: request.Response, name: string): string {
	const cookie = parseCookies(res).split('; ').find(value => value.startsWith(`${name}=`));
	if (!cookie) throw new Error(`Missing ${name} cookie`);
	return cookie.slice(name.length + 1);
}

export async function createUser(name: string): Promise<TestUser> {
	const user = { name, email: `${name.toLowerCase()}@test.com`, password: 'secret123' };
	const registered = await request(app).post('/auth/register').send(user).expect(201);
	const login = await request(app).post('/auth/login').send(user).expect(200);
	return { id: registered.body.data.id, cookies: parseCookies(login) };
}

export async function createProject(owner: TestUser, title = 'Test Project'): Promise<number> {
	const res = await request(app).post('/projects').set('Cookie', owner.cookies)
		.send({ title }).expect(201);
	return res.body.data.id;
}

export async function addMember(
	owner: TestUser, projectId: number, user: TestUser, role: 'editor' | 'viewer' | 'guide'
): Promise<void> {
	await request(app).post(`/projects/${projectId}/members`).set('Cookie', owner.cookies)
		.send({ user_id: user.id, role }).expect(201);
}

export async function createTask(owner: TestUser, projectId: number): Promise<number> {
	const res = await request(app).post(`/projects/${projectId}/tasks`).set('Cookie', owner.cookies)
		.send({ title: 'First Task', description: 'desc' }).expect(201);
	return res.body.data.id;
}
