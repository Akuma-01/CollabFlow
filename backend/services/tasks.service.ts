import pool from '../config/db';
import { Task, TaskStatus } from '../types';
import { isGuide, isProjectOwner, isUserMember } from './projects.service';

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
	const task = await pool.query('SELECT * FROM tasks WHERE id = $1', [task_id]);

	if (task.rows.length === 0) {
		throw { status: 404, message: 'Task not found' };
	}

	if (task.rows[0].project_id !== project_id) {
		throw { status: 403, message: 'Task does not belong to this project' };
	}

	// unassign task
	if (assigned_to === null) {
		const updateResult = await pool.query(
			'UPDATE tasks SET assigned_to = NULL WHERE id = $1 AND project_id = $2 RETURNING *',
			[task_id, project_id]
		);

		return updateResult.rows[0];
	}

	const isOwner = await isProjectOwner(project_id, assigned_to);
	const isMember = await isUserMember(project_id, assigned_to);
	const assigneeIsGuide = await isGuide(project_id, assigned_to);

	if (assigneeIsGuide) {
		throw { status: 403, message: 'Cannot assign task to a guide' };
	}

	if (!isOwner && !isMember) {
		throw { status: 403, message: 'User is not a member of this project' };
	}

	const updateResult = await pool.query(
		'UPDATE tasks SET assigned_to = $1 WHERE id = $2 AND project_id = $3 RETURNING *',
		[assigned_to, task_id, project_id]
	);
	return updateResult.rows[0];
};

export const updateTaskStatus = async (task_id: number, status: TaskStatus): Promise<Task> => {
	const result = await pool.query(
		'UPDATE tasks SET status=$1 WHERE id=$2 RETURNING *',
		[status, task_id]
	);
	return result.rows[0];
};

export const updateTask = async (task_id: number, project_id: number, title?: string, description?: string, deadline?: string): Promise<Task | undefined> => {
	const fields: string[] = [];
	const values: any[] = [];
	let index = 1;

	if (title) {
		fields.push(`title = $${index++}`);
		values.push(title);
	}
	if (description) {
		fields.push(`description = $${index++}`);
		values.push(description);
	}
	if (deadline !== undefined) {
		fields.push(`deadline = $${index++}`);
		values.push(deadline);
	}
	if (fields.length === 0) {
		throw { status: 400, message: "No update data provided" };
	}

	values.push(task_id, project_id);

	const result = await pool.query(
		`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${index++} AND project_id = $${index} RETURNING *`, values
	);

	return result.rows[0];
}

export const deleteTask = async (task_id: number, project_id: number): Promise<Task | undefined> => {
	const result = await pool.query("DELETE FROM tasks WHERE id = $1 AND project_id = $2 RETURNING *", [task_id, project_id]);

	if (result.rowCount === 0) {
		throw { status: 404, message: "Task not found" }
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
