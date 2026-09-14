import pool from '../config/db';
import { PoolClient } from 'pg';
import { Project, Task, TaskStatus } from '../types';
import { AssignmentReason, PersonSnapshot, TaskChanges } from '../types/activity';
import { withProjectTransaction } from '../utils/projectTransaction';
import * as activityService from './activity.service';
import { AppError } from '../utils/AppError';

type Assignee = PersonSnapshot & { email: string };
type TaskRow = Omit<Task, 'description' | 'deadline' | 'assigned_to'> & {
	description: string | null;
	deadline: Date | null;
	assigned_to: number | null;
};
type StoredTask = TaskRow & { assigned_to_name: string | null; assigned_to_email: string | null };

function decorateTask(task: TaskRow, assignee: Assignee | null): StoredTask {
	return { ...task, assigned_to_name: assignee?.name ?? null, assigned_to_email: assignee?.email ?? null };
}

function snapshot(assignee: PersonSnapshot | null): PersonSnapshot | null {
	return assignee ? { id: assignee.id, name: assignee.name } : null;
}

async function getTask(client: PoolClient, taskId: number, projectId: number) {
	const { rows } = await client.query<StoredTask & { deadline_day: string | null }>(
		`SELECT t.*, u.name AS assigned_to_name, u.email AS assigned_to_email,
		        to_char(t.deadline, 'YYYY-MM-DD') AS deadline_day
		 FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
		 WHERE t.id = $1 AND t.project_id = $2 FOR UPDATE OF t`, [taskId, projectId]
	);
	if (!rows[0]) throw new AppError('Task not found', 404);
	const { deadline_day, ...task } = rows[0];
	return { task, deadlineDay: deadline_day };
}

async function getAssignee(client: PoolClient, project: Project, userId: number | null): Promise<Assignee | null> {
	if (userId === null) return null;
	const { rows } = await client.query<Assignee & { role: string | null }>(
		`SELECT u.id, u.name, u.email, pm.role FROM users u
		 LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $1
		 WHERE u.id = $2`, [project.id, userId]
	);
	const assignee = rows[0];
	if (!assignee || (userId !== project.owner_id && !assignee.role)) {
		throw new AppError('User is not a member of this project', 403);
	}
	if (assignee.role === 'guide') throw new AppError('Cannot assign task to a guide', 403);
	return assignee;
}

export const createTask = async (
	title: string,
	description: string | undefined,
	project_id: number,
	created_by: number,
	deadline?: string,
	assigned_to?: number | null,
): Promise<StoredTask> => withProjectTransaction(project_id, created_by, ['editor'], async (client, project) => {
	const assignee = await getAssignee(client, project, assigned_to ?? null);
	const { rows } = await client.query<TaskRow>(
		`INSERT INTO tasks (title, description, project_id, created_by, deadline, assigned_to)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
		[title, description ?? null, project_id, created_by, deadline ?? null, assigned_to ?? null]
	);
	const task = decorateTask(rows[0], assignee);
	await activityService.log(client, {
		projectId: project_id, actorId: created_by, entityType: 'task', entityId: task.id,
		action: 'TASK_CREATED', metadata: { title, status: task.status, deadline: deadline ?? null, assignee: snapshot(assignee) },
	});
	return task;
});

export const getProjectTasks = async (
	project_id: number,
	assigned_to: number | null,
	status: TaskStatus | null
): Promise<Task[]> => {
	const result = await pool.query(
		`SELECT 
      t.id, 
      t.title, 
      t.description, 
      t.project_id, 
	  t.assigned_to,
	  u.email AS assigned_to_email,
      u.name AS assigned_to_name, 
      t.status,
	  t.deadline
    FROM tasks t 
    LEFT JOIN users u ON t.assigned_to = u.id 
    WHERE t.project_id = $1 
		AND ($2::int IS NULL OR t.assigned_to = $2)
		AND ($3::text IS NULL OR t.status = $3)
	ORDER BY t.id ASC`,
		[project_id, assigned_to, status]
	);
	return result.rows;
};

export const assignTask = async (
	task_id: number, project_id: number, assigned_to: number | null, actorId: number
): Promise<StoredTask> => withProjectTransaction(project_id, actorId, ['editor'], async (client, project) => {
	const { task } = await getTask(client, task_id, project_id);
	const assignee = await getAssignee(client, project, assigned_to);
	if (task.assigned_to === assigned_to) return task;
	const { rows } = await client.query<TaskRow>(
		'UPDATE tasks SET assigned_to = $1 WHERE id = $2 AND project_id = $3 RETURNING *',
		[assigned_to, task_id, project_id]
	);
	await activityService.log(client, {
		projectId: project_id, actorId, entityType: 'task', entityId: task_id, action: 'TASK_ASSIGNED',
		metadata: { title: task.title, from: task.assigned_to === null ? null : { id: task.assigned_to, name: task.assigned_to_name! }, to: snapshot(assignee) },
	});
	return decorateTask(rows[0], assignee);
});

export const updateTaskStatus = async (
	task_id: number, project_id: number, status: TaskStatus, actorId: number
): Promise<StoredTask> => withProjectTransaction(project_id, actorId, ['editor'], async client => {
	const { task } = await getTask(client, task_id, project_id);
	if (task.status === status) return task;
	const { rows } = await client.query<TaskRow>(
		'UPDATE tasks SET status = $1 WHERE id = $2 AND project_id = $3 RETURNING *', [status, task_id, project_id]
	);
	await activityService.log(client, {
		projectId: project_id, actorId, entityType: 'task', entityId: task_id, action: 'TASK_MOVED',
		metadata: { title: task.title, from: task.status, to: status },
	});
	return { ...task, ...rows[0] };
});

export const updateTask = async (
	task_id: number, project_id: number, actorId: number,
	title?: string, description?: string, deadline?: string
): Promise<StoredTask> => withProjectTransaction(project_id, actorId, ['editor'], async client => {
	if (title === undefined && description === undefined && deadline === undefined) {
		throw new AppError('No update data provided', 400);
	}
	const { task, deadlineDay } = await getTask(client, task_id, project_id);
	const changes: TaskChanges = {};
	if (title !== undefined && title !== task.title) changes.title = { from: task.title, to: title };
	if (description !== undefined && description !== task.description) changes.description = { from: task.description, to: description };
	if (deadline !== undefined && deadline !== deadlineDay) changes.deadline = { from: deadlineDay, to: deadline };
	const fields = Object.keys(changes) as (keyof TaskChanges)[];
	if (fields.length === 0) return task;
	const { rows } = await client.query<TaskRow>(
		`UPDATE tasks SET ${fields.map((field, i) => `${field} = $${i + 1}`).join(', ')}
		 WHERE id = $${fields.length + 1} AND project_id = $${fields.length + 2} RETURNING *`,
		[...fields.map(field => changes[field]!.to), task_id, project_id]
	);
	await activityService.log(client, {
		projectId: project_id, actorId, entityType: 'task', entityId: task_id, action: 'TASK_UPDATED',
		metadata: { title: rows[0].title, changes },
	});
	return { ...task, ...rows[0] };
});

export const deleteTask = async (
	task_id: number, project_id: number, actorId: number
): Promise<StoredTask> => withProjectTransaction(project_id, actorId, ['editor'], async client => {
	const { task } = await getTask(client, task_id, project_id);
	await client.query('DELETE FROM tasks WHERE id = $1 AND project_id = $2', [task_id, project_id]);
	await activityService.log(client, {
		projectId: project_id, actorId, entityType: 'task', entityId: task_id, action: 'TASK_DELETED',
		metadata: { title: task.title, status: task.status },
	});
	return task;
});

// Called by membership mutations with the project lock and transaction already held.
export async function unassignMemberTasks(
	client: PoolClient, projectId: number, member: PersonSnapshot, actorId: number, reason: AssignmentReason
): Promise<void> {
	const { rows } = await client.query<{ id: number; title: string }>(
		'UPDATE tasks SET assigned_to = NULL WHERE project_id = $1 AND assigned_to = $2 RETURNING id, title',
		[projectId, member.id]
	);
	for (const task of rows.sort((a, b) => a.id - b.id)) {
		await activityService.log(client, {
			projectId, actorId, entityType: 'task', entityId: task.id, action: 'TASK_ASSIGNED',
			metadata: { title: task.title, from: member, to: null, reason },
		});
	}
}

export const getAssignedTasks = async (user_id: number) => {
	const result = await pool.query(`
			SELECT 
				t.id,
				t.title,
				t.description,
				t.status,
				t.deadline,
				t.project_id,
				p.title AS project_title
			FROM tasks t
			JOIN projects p ON p.id = t.project_id
			WHERE t.assigned_to = $1
				AND (p.owner_id = $1 OR EXISTS (
					SELECT 1 FROM project_members pm
					WHERE pm.project_id = p.id AND pm.user_id = $1
				))
			ORDER BY t.deadline ASC NULLS LAST
		`, [user_id]
	);

	return result.rows;
}
