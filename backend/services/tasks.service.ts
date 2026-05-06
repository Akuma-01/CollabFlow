import pool from '../config/db';
import { Task, TaskStatus } from '../types';
import { AppError } from '../utils/AppError';

export const createTask = async (
	title: string,
	description: string | undefined,
	project_id: number,
	created_by: number,
	deadline?: string,
): Promise<Task> => {
	const result = await pool.query(
		'INSERT INTO tasks (title, description, project_id, created_by, deadline) VALUES ($1, $2, $3, $4, $5) RETURNING *',
		[title, description, project_id, created_by, deadline || null]
	);
	return result.rows[0];
};

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
	task_id: number,
	project_id: number,
	assigned_to: number
): Promise<Task> => {
	const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1 AND project_id = $2', [task_id, project_id]);

	if (taskResult.rows.length === 0) {
		throw new AppError('Task not found or does not belong to this project', 404);
	}

	// unassign task
	if (assigned_to === null) {
		const result = await pool.query(
			'UPDATE tasks SET assigned_to = NULL WHERE id = $1 AND project_id = $2 RETURNING *',
			[task_id, project_id]
		);

		return result.rows[0];
	}

	const memberResult = await pool.query(
		`SELECT p.owner_id, pm.role AS member_role
		 FROM projects p
		 LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
		 WHERE p.id = $1`,
		[project_id, assigned_to]
	);

	if (memberResult.rows.length === 0) {
		throw new AppError('Project not found', 404);
	}

	const { owner_id, member_role } = memberResult.rows[0];
	const isOwner = owner_id === assigned_to;
	const isGuide = member_role === 'guide';
	const isMember = member_role !== null;


	if (isGuide) {
		throw new AppError('Cannot assign task to a guide', 403);
	}

	if (!isOwner && !isMember) {
		throw new AppError('User is not a member of this project', 403);
	}

	const result = await pool.query(
		'UPDATE tasks SET assigned_to = $1 WHERE id = $2 AND project_id = $3 RETURNING *',
		[assigned_to, task_id, project_id]
	);
	return result.rows[0];
};

export const updateTaskStatus = async (task_id: number, status: TaskStatus): Promise<Task> => {
	const result = await pool.query(
		'UPDATE tasks SET status=$1 WHERE id=$2 RETURNING *',
		[status, task_id]
	);
	if (result.rowCount === 0) {
		throw new AppError('Task not found', 404);
	}
	return result.rows[0];
};

export const updateTask = async (task_id: number, project_id: number, title?: string, description?: string, deadline?: string): Promise<Task | undefined> => {
	const fields: string[] = [];
	const values: unknown[] = [];
	let index = 1;

	if (title !== undefined) {
		fields.push(`title = $${index++}`);
		values.push(title);
	}
	if (description !== undefined) {
		fields.push(`description = $${index++}`);
		values.push(description);
	}
	if (deadline !== undefined) {
		fields.push(`deadline = $${index++}`);
		values.push(deadline);
	}
	if (fields.length === 0) {
		throw new AppError('No update data provided', 400);
	}

	values.push(task_id, project_id);

	const result = await pool.query(
		`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${index++} AND project_id = $${index} RETURNING *`, values
	);

	return result.rows[0];
}

export const deleteTask = async (task_id: number, project_id: number): Promise<Task | undefined> => {
	const result = await pool.query(
		"DELETE FROM tasks WHERE id = $1 AND project_id = $2 RETURNING *", [task_id, project_id]);

	if (result.rowCount === 0) {
		throw new AppError('Task not found', 404);
	}
	return result.rows[0];
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
			ORDER BY t.deadline ASC NULLS LAST
		`, [user_id]
	);

	return result.rows;
}
