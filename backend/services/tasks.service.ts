import pool from '../config/db';
import { Task, TaskStatus } from '../types';
import { isProjectOwner, isUserMember } from './projects.service';

export const createTask = async (
	title: string,
	description: string | undefined,
	project_id: number,
	created_by: number
): Promise<Task> => {
	const result = await pool.query(
		'INSERT INTO tasks (title, description, project_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
		[title, description, project_id, created_by]
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
      u.name AS assigned_to_name, 
      status 
    FROM tasks t 
    LEFT JOIN users u ON t.assigned_to = u.id 
    WHERE t.project_id = $1 
    AND ($2::int IS NULL OR t.assigned_to = $2)
    AND ($3::text IS NULL OR t.status = $3)`,
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

	const taskData: Task = task.rows[0];

	const isOwner = await isProjectOwner(taskData.project_id, assigned_to);
	const isMember = await isUserMember(taskData.project_id, assigned_to);

	if (isOwner || isMember) {
		const updateResult = await pool.query(
			'UPDATE tasks SET assigned_to = $1 WHERE id = $2 RETURNING *',
			[assigned_to, task_id]
		);
		return updateResult.rows[0];
	} else {
		throw { status: 403, message: 'User is not a member of this project' };
	}
};

export const updateTaskStatus = async (task_id: number, status: TaskStatus): Promise<Task> => {
	const result = await pool.query(
		'UPDATE tasks SET status=$1 WHERE id=$2 RETURNING *',
		[status, task_id]
	);
	return result.rows[0];
};
